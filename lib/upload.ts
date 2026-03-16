/**
 * UNIFIED UPLOAD ENGINE
 *
 * Extracted from home/page.tsx. Pure utility functions — no React dependencies.
 * Handles file validation, resize, aspect detection, and Supabase upload via XHR.
 */

import { snapToPreset } from '@/lib/aspect-ratios'

// ── Constants ───────────────────────────────────────────────

export const VIDEO_MIME = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'video/mov',
]

// ── Type guards ─────────────────────────────────────────────

/** Check if a file is a video by MIME type or extension */
export function isVideoFile(file: File): boolean {
  return (
    VIDEO_MIME.includes(file.type) ||
    /\.(mp4|mov|webm|m4v)$/i.test(file.name)
  )
}

/** Check if a file is HEIC format (needs conversion before upload) */
export function isHEIC(file: File): boolean {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    /\.heic$/i.test(file.name)
  )
}

// ── XHR Upload with Progress ────────────────────────────────

/**
 * Get a presigned upload URL from the server.
 * Server uses service role key — bypasses storage RLS policies.
 */
async function getPresignedUrl(path: string): Promise<{ signedUrl: string; token: string } | null> {
  try {
    const res = await fetch('/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

/**
 * Upload a file to Supabase Storage via XHR with progress tracking.
 * Uses presigned URL (service role) first, falls back to anon key.
 * Returns the public URL of the uploaded file.
 *
 * @param file       The file to upload
 * @param path       Storage path (e.g. "12345/timestamp-hash.jpg")
 * @param onProgress Callback with upload percentage (0-100)
 */
export async function uploadWithProgress(
  file: File,
  path: string,
  onProgress: (pct: number) => void
): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Try presigned URL first (bypasses storage policies)
  const presigned = await getPresignedUrl(path)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.timeout = 5 * 60 * 1000 // 5 minutes for large files

    let lastPct = -1
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100)
        if (pct !== lastPct) { lastPct = pct; onProgress(pct) }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const url = `${supabaseUrl}/storage/v1/object/public/content/${path}`
        resolve(url)
      } else {
        console.error('UPLOAD_XHR_FAIL', { status: xhr.status, response: xhr.responseText, path, presigned: !!presigned })
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`))
      }
    }

    xhr.onerror = () => {
      console.error('UPLOAD_XHR_ONERROR', { status: xhr.status, response: xhr.responseText, path })
      reject(new Error('Network error during upload'))
    }

    xhr.ontimeout = () => {
      console.error('UPLOAD_XHR_TIMEOUT', { path, timeout: xhr.timeout })
      reject(new Error('Upload timed out'))
    }

    xhr.onabort = () => {
      console.error('UPLOAD_XHR_ABORT', { path })
      reject(new Error('Upload was cancelled'))
    }

    const mimeType = file.type === 'video/quicktime'
      ? 'video/mp4'
      : (file.type || 'application/octet-stream')

    if (presigned) {
      // Presigned URL — PUT with token, no auth headers needed
      xhr.open('PUT', presigned.signedUrl)
      xhr.setRequestHeader('Content-Type', mimeType)
    } else {
      // Fallback — direct upload with anon key
      xhr.open('POST', `${supabaseUrl}/storage/v1/object/content/${path}`)
      xhr.setRequestHeader('Authorization', `Bearer ${supabaseKey}`)
      xhr.setRequestHeader('apikey', supabaseKey)
      xhr.setRequestHeader('Content-Type', mimeType)
      xhr.setRequestHeader('x-upsert', 'true')
    }

    xhr.send(file)
  })
}

// ── Video Thumbnail ─────────────────────────────────────────

/**
 * Extract a thumbnail frame from a video file.
 * Seeks to 0.5s and captures a canvas screenshot.
 * Returns a data URL (image/jpeg).
 */
export function getVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    const blobUrl = URL.createObjectURL(file)
    video.src = blobUrl

    let cleaned = false
    const cleanup = () => {
      if (!cleaned) {
        cleaned = true
        URL.revokeObjectURL(blobUrl)
      }
    }

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, video.duration || 0)
    }

    video.onseeked = () => {
      try {
        const w = video.videoWidth || 320
        const h = video.videoHeight || 240
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
        cleanup()
        resolve(canvas.toDataURL('image/jpeg', 0.6))
      } catch (e) {
        cleanup()
        reject(e)
      }
    }

    video.onerror = () => {
      cleanup()
      reject(new Error('Could not load video'))
    }

    setTimeout(() => {
      cleanup()
      reject(new Error('Thumbnail timeout'))
    }, 4000)
  })
}

// ── Image Resize ────────────────────────────────────────────

/**
 * Resize an image file if it exceeds maxWidth.
 * Skips files under 300KB. Converts to JPEG.
 * Returns the original file if no resize is needed.
 */
export async function resizeImage(file: File, maxWidth = 2400): Promise<File> {
  if (file.size < 300 * 1024) return file

  return new Promise((resolve, reject) => {
    const img = document.createElement('img')
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(img.src)
      reject(new Error('Resize timeout'))
    }, 10000)

    img.onload = () => {
      try {
        clearTimeout(timeout)
        if (img.width <= maxWidth) {
          URL.revokeObjectURL(img.src)
          resolve(file)
          return
        }
        const scale = maxWidth / img.width
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(img.src)
        canvas.toBlob(
          (blob) => {
            resolve(
              new File(
                [blob!],
                file.name.replace(/\.[^.]+$/, '.jpg'),
                { type: 'image/jpeg' }
              )
            )
          },
          'image/jpeg',
          0.92
        )
      } catch (e) {
        clearTimeout(timeout)
        URL.revokeObjectURL(img.src)
        reject(e)
      }
    }

    img.onerror = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(img.src)
      reject(new Error('Image load failed'))
    }

    img.src = URL.createObjectURL(file)
  })
}

// ── Aspect Detection ────────────────────────────────────────

/**
 * Detect image dimensions from a File → snap to aspect preset.
 */
export function detectImageAspect(file: File): Promise<string> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve('square')
      return
    }
    const img = document.createElement('img')
    img.onload = () => {
      const preset = snapToPreset(img.naturalWidth, img.naturalHeight)
      URL.revokeObjectURL(img.src)
      resolve(preset)
    }
    img.onerror = () => {
      resolve('square')
    }
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Detect video dimensions from a File → snap to aspect preset.
 */
export function detectVideoAspect(file: File): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const preset = snapToPreset(video.videoWidth, video.videoHeight)
      URL.revokeObjectURL(video.src)
      resolve(preset)
    }
    video.onerror = () => {
      resolve('square')
    }
    video.src = URL.createObjectURL(file)
  })
}
