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
}

const glassBar: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(24px) saturate(140%)',
  WebkitBackdropFilter: 'blur(24px) saturate(140%)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 999,
}

export default function OwnerActionBar({
  open,
  slug,
  activeRoomId,
  serialNumber,
  onTileAdded,
  onTileReplaced,
  onTileProgress,
}: OwnerActionBarProps) {
  const [verb, setVerb] = useState<Verb>('idle')
  const [linkUrl, setLinkUrl] = useState('')
  const [thoughtText, setThoughtText] = useState('')
  const [containerLabel, setContainerLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) {
      setVerb('idle')
      setLinkUrl('')
      setThoughtText('')
      setContainerLabel('')
    }
  }, [open])

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
  async function processFile(file: File, batchIndex: number) {
    if (!serialNumber) return
    const isVideo = isVideoFile(file)
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
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.tile) onTileReplaced(tempId, data.tile)
      }
    } catch (e) {
      console.error('upload failed', e)
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
    color: 'rgba(255,255,255,0.85)',
    padding: '8px 14px',
    fontSize: 12,
    letterSpacing: '0.04em',
    textTransform: 'lowercase',
    fontFamily: "'DM Mono', 'Courier New', monospace",
    cursor: 'pointer',
    borderRadius: 999,
  }
  const buttonActive: React.CSSProperties = {
    ...buttonStyle,
    background: 'rgba(255,255,255,0.10)',
    color: 'rgba(255,255,255,0.98)',
  }

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-1.5"
      style={{
        ...glassBar,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        maxWidth: 'min(440px, calc(100vw - 24px))',
      }}
      data-owner-action-bar
    >
      <button type="button" style={verb === 'link' ? buttonActive : buttonStyle} onClick={() => setVerb(verb === 'link' ? 'idle' : 'link')}>
        link
      </button>
      <button type="button" style={verb === 'text' ? buttonActive : buttonStyle} onClick={() => setVerb(verb === 'text' ? 'idle' : 'text')}>
        text
      </button>
      <button type="button" style={verb === 'collection' ? buttonActive : buttonStyle} onClick={() => setVerb(verb === 'collection' ? 'idle' : 'collection')}>
        collection
      </button>
      <button
        type="button"
        aria-label="upload image or video"
        title="upload"
        style={buttonStyle}
        onClick={() => fileInputRef.current?.click()}
      >
        upload
      </button>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) handleFilesPicked(files); e.target.value = '' }} />

      {(verb === 'link' || verb === 'text' || verb === 'collection') && (
        <div
          className="absolute left-0 right-0 px-3 py-2 flex items-center gap-2"
          style={{
            ...glassBar,
            bottom: 'calc(100% + 8px)',
            borderRadius: 16,
          }}
        >
          {verb === 'link' && (
            <>
              <input ref={inputRef} type="url" inputMode="url" placeholder="paste any link…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitLink() }} className="flex-1 bg-transparent text-white/85 placeholder-white/30 outline-none text-sm font-mono" />
              <button onClick={submitLink} disabled={!linkUrl.trim() || busy} className="text-xs text-white/70 hover:text-white/95 px-2 py-1 disabled:opacity-30 font-mono">{busy ? '…' : 'add'}</button>
            </>
          )}
          {verb === 'text' && (
            <>
              <input ref={inputRef} type="text" placeholder="a thought…" value={thoughtText} onChange={(e) => setThoughtText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitThought() }} className="flex-1 bg-transparent text-white/85 placeholder-white/30 outline-none text-sm font-mono" />
              <button onClick={submitThought} disabled={!thoughtText.trim() || busy} className="text-xs text-white/70 hover:text-white/95 px-2 py-1 disabled:opacity-30 font-mono">{busy ? '…' : 'add'}</button>
            </>
          )}
          {verb === 'collection' && (
            <>
              <input ref={inputRef} type="text" placeholder="collection name…" value={containerLabel} onChange={(e) => setContainerLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitContainer() }} className="flex-1 bg-transparent text-white/85 placeholder-white/30 outline-none text-sm font-mono" />
              <button onClick={submitContainer} disabled={!containerLabel.trim() || busy} className="text-xs text-white/70 hover:text-white/95 px-2 py-1 disabled:opacity-30 font-mono">{busy ? '…' : 'add'}</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
