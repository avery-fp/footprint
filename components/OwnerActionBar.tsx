'use client'

import { useEffect, useRef, useState } from 'react'
import { uploadWithProgress, resizeImage, detectImageAspect, detectVideoAspect, isVideoFile } from '@/lib/upload'

/**
 * OwnerActionBar — bottom toolbar with the four creation verbs only.
 *
 * Four buttons: link, text, collection, image. Each labeled. That's it.
 * Page-level settings (wallpaper, public/private) and room-level
 * settings (layout, lock, rename, delete) live in the per-room ⋯
 * popover, not here. The bottom bar is for "what to add."
 *
 * Each verb expands a small input above the bar when tapped. Submit
 * fires an optimistic add + server POST. No save action.
 */

type Verb = 'idle' | 'link' | 'text' | 'collection'

interface OwnerActionBarProps {
  open: boolean
  slug: string
  activeRoomId: string | null
  serialNumber: number | null
  onTileAdded: (tile: any) => void
  onTileReplaced: (tempId: string, real: any) => void
  onTileProgress: (tempId: string, pct: number) => void
  onTileRemoved: (id: string) => void
}

const glassBar: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  backdropFilter: 'blur(28px) saturate(140%)',
  WebkitBackdropFilter: 'blur(28px) saturate(140%)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 999,
}

// Active input panels (link URL, thought text, collection name) need
// enough body to read as a real input surface — not a wireframe ghost.
// Darker dim under a saturated blur so typed text sits on glass, not on
// the page beneath.
const inputPanel: React.CSSProperties = {
  background: 'rgba(0,0,0,0.55)',
  backdropFilter: 'blur(28px) saturate(140%)',
  WebkitBackdropFilter: 'blur(28px) saturate(140%)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.30)',
}

const MAX_VIDEO_SIZE = 50 * 1024 * 1024

export default function OwnerActionBar({
  open,
  slug,
  activeRoomId,
  serialNumber,
  onTileAdded,
  onTileReplaced,
  onTileProgress,
  onTileRemoved,
}: OwnerActionBarProps) {
  const [verb, setVerb] = useState<Verb>('idle')
  const [linkUrl, setLinkUrl] = useState('')
  const [thoughtText, setThoughtText] = useState('')
  const [containerLabel, setContainerLabel] = useState('')
  const [busy, setBusy] = useState(false)
  // Optional image attached to a thought. When present, submitThought
  // routes through the upload pipeline and stores the text as the
  // image's caption (caption_hidden=false). Surface = image, depth = thought.
  const [attachedImage, setAttachedImage] = useState<File | null>(null)
  const [attachedPreviewUrl, setAttachedPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const thoughtImageInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  // Clear the attached image whenever the sheet closes or the user
  // switches away from the text verb — leaving it parked across verb
  // switches would be a surprise the next time they open text mode.
  function clearAttachedImage() {
    setAttachedImage(null)
    setAttachedPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  useEffect(() => {
    if (!open) {
      setVerb('idle')
      setLinkUrl('')
      setThoughtText('')
      setContainerLabel('')
      clearAttachedImage()
    }
  }, [open])

  useEffect(() => {
    if (verb !== 'text') clearAttachedImage()
  }, [verb])

  // Final safety net: revoke any outstanding blob URL on unmount.
  useEffect(() => () => {
    setAttachedPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  useEffect(() => {
    if (verb === 'idle') return
    const id = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(id)
  }, [verb])

  if (!open) return null

  async function submitLink() {
    const url = linkUrl.trim()
    if (!url || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/tiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, url, room_id: activeRoomId }),
      })
      const data = await res.json()
      if (data.tile) onTileAdded(data.tile)
      setLinkUrl('')
      setVerb('idle')
    } catch (e) {
      console.error('add link failed', e)
    } finally {
      setBusy(false)
    }
  }

  async function submitThought() {
    const text = thoughtText.trim()
    if (!text || busy) return
    // Image + text: route through the existing upload pipeline. The
    // text rides along as the image's caption (caption_hidden=false).
    // No new endpoint, no new table — one image tile with note depth.
    if (attachedImage) {
      if (!serialNumber) return
      setBusy(true)
      try {
        await processFile(attachedImage, 0, { caption: text })
        setThoughtText('')
        clearAttachedImage()
        setVerb('idle')
      } finally {
        setBusy(false)
      }
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/tiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, thought: text, room_id: activeRoomId }),
      })
      const data = await res.json()
      if (data.tile) onTileAdded(data.tile)
      setThoughtText('')
      setVerb('idle')
    } catch (e) {
      console.error('add thought failed', e)
    } finally {
      setBusy(false)
    }
  }

  async function submitContainer() {
    const label = containerLabel.trim()
    if (!label || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, label, room_id: activeRoomId }),
      })
      const data = await res.json()
      if (data.tile) onTileAdded(data.tile)
      setContainerLabel('')
      setVerb('idle')
    } catch (e) {
      console.error('add container failed', e)
    } finally {
      setBusy(false)
    }
  }

  // Handles both image and video uploads. Branches on isVideoFile:
  // videos skip the image resize (resizeImage is image-only), use
  // detectVideoAspect, and upload with their original content type so
  // /api/upload/register routes them through the video pipeline.
  //
  // processFile does the work for one file. handleFilesPicked owns the
  // busy flag for the whole batch so the inner loop can await each file
  // without the per-file busy guard rejecting it.
  async function processFile(
    file: File,
    batchIndex: number,
    opts?: { caption?: string }
  ) {
    if (!serialNumber) return
    const isVideo = isVideoFile(file)
    if (isVideo && file.size > MAX_VIDEO_SIZE) {
      window.alert('Videos must be under 50 MB.')
      return
    }
    let aspect = 'square'
    try {
      aspect = isVideo ? await detectVideoAspect(file) : await detectImageAspect(file)
    } catch {}
    let payload: File = file
    if (!isVideo) {
      try { payload = await resizeImage(file) } catch { payload = file }
    }
    const ext = isVideo ? (file.name.split('.').pop() || 'mp4').toLowerCase() : 'jpg'
    const filename = `${serialNumber}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const contentType = payload.type || (isVideo ? 'video/mp4' : 'image/jpeg')
    const tempId = `temp-${Date.now()}-${batchIndex}-${Math.random().toString(36).slice(2, 6)}`
    const previewUrl = URL.createObjectURL(file)
    onTileAdded({
      id: tempId,
      url: previewUrl,
      type: isVideo ? 'video' : 'image',
      position: Number.MAX_SAFE_INTEGER,
      room_id: activeRoomId,
      size: 2,
      aspect,
      _temp: true,
      _progress: 0,
      ...(isVideo ? { status: 'uploading' } : {}),
    })
    try {
      const publicUrl = await uploadWithProgress(
        new File([payload], payload.name || filename, { type: contentType }),
        filename,
        (pct) => onTileProgress(tempId, pct),
        slug,
      )
      const res = await fetch('/api/upload/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          url: publicUrl,
          room_id: activeRoomId,
          aspect,
          content_type: contentType,
          size: 2,
          // Image + thought becomes one image tile with a visible
          // note. Owner can flip to tap-to-reveal later via the tile
          // editor. Empty caption short-circuited upstream so we
          // never persist an empty string.
          ...(opts?.caption ? { caption: opts.caption, caption_hidden: false } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.tile) {
        onTileReplaced(tempId, data.tile)
      } else {
        throw new Error(data.error || `Upload registration failed (${res.status})`)
      }
    } catch (e) {
      console.error('upload failed', e)
      onTileRemoved(tempId)
      window.alert(e instanceof Error ? e.message : 'Upload failed. Please try again.')
    } finally {
      URL.revokeObjectURL(previewUrl)
    }
  }

  // Multi-select supported up to MAX_BATCH. Sequential to keep server
  // load predictable and to surface tiles in the order picked. The
  // batch sets busy once so the file picker can't be retriggered
  // mid-batch — but each file can still await its own upload.
  const MAX_BATCH = 10
  async function handleFilesPicked(files: File[]) {
    if (busy || !serialNumber || files.length === 0) return
    setBusy(true)
    try {
      const queue = files.slice(0, MAX_BATCH)
      for (let i = 0; i < queue.length; i++) {
        await processFile(queue[i], i)
      }
    } finally {
      setBusy(false)
    }
  }

  const buttonStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.62)',
    width: 40,
    height: 40,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    borderRadius: 999,
    transition: 'color 160ms ease, background-color 160ms ease',
  }
  const buttonActive: React.CSSProperties = {
    ...buttonStyle,
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.95)',
  }

  return (
    <>
      <div
        className="fixed left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-1.5 py-1"
        style={{
          ...glassBar,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          // Reserve right-edge real-estate for the bottom-right cluster
          // (gift + collection pills). The center bar must never extend
          // into that lane, even on narrow viewports.
          maxWidth: 'min(220px, calc(100vw - 184px))',
        }}
        data-owner-action-bar
      >
        <button
          type="button"
          aria-label="add link"
          title="add link"
          style={verb === 'link' ? buttonActive : buttonStyle}
          onClick={() => setVerb(verb === 'link' ? 'idle' : 'link')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
            <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="add text"
          title="add text"
          style={verb === 'text' ? buttonActive : buttonStyle}
          onClick={() => setVerb(verb === 'text' ? 'idle' : 'text')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6h16" />
            <path d="M12 6v14" />
            <path d="M9 20h6" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={busy ? 'uploading' : 'upload image or video'}
          aria-busy={busy}
          title={busy ? 'uploading…' : 'upload'}
          disabled={busy}
          style={{ ...buttonStyle, opacity: busy ? 0.5 : 1, cursor: busy ? 'progress' : 'pointer' }}
          onClick={() => fileInputRef.current?.click()}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v12" />
            <path d="M7 9l5-5 5 5" />
            <path d="M4 20h16" />
          </svg>
        </button>

        <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple disabled={busy} style={{ display: 'none' }} onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) handleFilesPicked(files); e.target.value = '' }} />

        {(verb === 'link' || verb === 'text') && (
        <div
          className={`absolute left-0 right-0 px-3 py-2.5 flex gap-2 ${verb === 'text' ? 'flex-col items-stretch' : 'items-center'}`}
          style={{
            ...inputPanel,
            bottom: 'calc(100% + 10px)',
            borderRadius: 18,
            // Active input panels span wider than the (narrowed) center
            // bar so URLs and thoughts have room to breathe.
            minWidth: 'min(320px, calc(100vw - 48px))',
          }}
        >
          {verb === 'link' && (
            <>
              <input ref={inputRef as React.RefObject<HTMLInputElement>} type="url" inputMode="url" placeholder="paste any link…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitLink() }} className="flex-1 bg-transparent text-white/[0.78] placeholder:text-white/[0.35] outline-none text-sm font-mono" />
              <button onClick={submitLink} disabled={!linkUrl.trim() || busy} className="text-xs text-white/70 hover:text-white/95 px-2 py-1 disabled:opacity-30 font-mono">{busy ? '…' : 'add'}</button>
            </>
          )}
          {verb === 'text' && (
            <>
              {/* Roomy textarea — six rows / 160px minimum so drafting
                  feels comfortable. Enter submits, Shift+Enter is a
                  newline (matches the prior single-line Enter semantic
                  for muscle memory). */}
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                placeholder="a thought…"
                value={thoughtText}
                onChange={(e) => setThoughtText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submitThought()
                  }
                }}
                rows={6}
                style={{ minHeight: 160, resize: 'none' }}
                className="w-full bg-transparent text-white/[0.78] placeholder:text-white/[0.35] outline-none text-sm font-mono"
              />
              <div className="flex items-center gap-2">
                {/* Attach image — optional. Image + text becomes one
                    image tile with the text as a visible caption. */}
                <button
                  type="button"
                  onClick={() => thoughtImageInputRef.current?.click()}
                  aria-label={attachedImage ? 'change attached image' : 'attach image'}
                  title={attachedImage ? 'change image' : 'attach image'}
                  disabled={busy}
                  className="text-white/55 hover:text-white/85 transition-colors p-1 disabled:opacity-30"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </button>
                {attachedPreviewUrl && (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachedPreviewUrl}
                      alt="attachment preview"
                      style={{
                        width: 32,
                        height: 32,
                        objectFit: 'cover',
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.10)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={clearAttachedImage}
                      aria-label="remove attached image"
                      title="remove"
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 16,
                        height: 16,
                        borderRadius: 999,
                        background: 'rgba(0,0,0,0.85)',
                        border: '1px solid rgba(255,255,255,0.20)',
                        color: 'rgba(255,255,255,0.85)',
                        fontSize: 10,
                        lineHeight: 1,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="flex-1" />
                <button onClick={submitThought} disabled={!thoughtText.trim() || busy} className="text-xs text-white/70 hover:text-white/95 px-2 py-1 disabled:opacity-30 font-mono">{busy ? '…' : 'add'}</button>
              </div>
              <input
                ref={thoughtImageInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  // Replace any prior attachment cleanly so we never
                  // accumulate dangling blob URLs.
                  setAttachedPreviewUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev)
                    return URL.createObjectURL(file)
                  })
                  setAttachedImage(file)
                }}
              />
            </>
          )}
        </div>
      )}
      </div>

      {/* Collection input panel — anchored above the collection trigger
          at bottom-right, never above the center bar. Keeps panel and
          trigger visually connected. */}
      {verb === 'collection' && (
        <div
          className="fixed z-30 px-3 py-2.5 flex gap-2 items-center"
          style={{
            ...inputPanel,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px + 36px + 10px)',
            right: 16,
            borderRadius: 18,
            minWidth: 'min(280px, calc(100vw - 32px))',
          }}
        >
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            placeholder="collection name…"
            value={containerLabel}
            onChange={(e) => setContainerLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitContainer() }}
            className="flex-1 bg-transparent text-white/[0.78] placeholder:text-white/[0.35] outline-none text-sm font-mono"
          />
          <button
            onClick={submitContainer}
            disabled={!containerLabel.trim() || busy}
            className="text-xs text-white/70 hover:text-white/95 px-2 py-1 disabled:opacity-30 font-mono"
          >
            {busy ? '…' : 'add'}
          </button>
        </div>
      )}

      {/* Collection — quiet, separate. A collection is a room/container
          action, not a quick-add primitive. Sits adjacent to the main
          bar so it remains discoverable without crowding the verbs. */}
      <button
        type="button"
        aria-label="add collection"
        title="add collection"
        onClick={() => setVerb(verb === 'collection' ? 'idle' : 'collection')}
        className="fixed z-30 touch-manipulation"
        style={{
          ...glassBar,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          right: 16,
          width: 36,
          height: 36,
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: verb === 'collection' ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)',
          opacity: 0.92,
          transition: 'color 160ms ease',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1.2" />
          <rect x="14" y="3" width="7" height="7" rx="1.2" />
          <rect x="3" y="14" width="7" height="7" rx="1.2" />
          <rect x="14" y="14" width="7" height="7" rx="1.2" />
        </svg>
      </button>
    </>
  )
}
