'use client'

import { useEffect, useRef, useState } from 'react'
import { uploadWithProgress, resizeImage, detectImageAspect } from '@/lib/upload'

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
  background: 'rgba(0,0,0,0.62)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
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

  async function handleImagePicked(file: File) {
    if (busy || !serialNumber) return
    setBusy(true)
    try {
      let aspect = 'square'
      try { aspect = await detectImageAspect(file) } catch {}
      let resized: File
      try { resized = await resizeImage(file) } catch { resized = file }
      const filename = `${serialNumber}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      const contentType = resized.type || 'image/jpeg'
      const tempId = `temp-${Date.now()}`
      const previewUrl = URL.createObjectURL(file)
      onTileAdded({
        id: tempId,
        url: previewUrl,
        type: 'image',
        position: Number.MAX_SAFE_INTEGER,
        room_id: activeRoomId,
        size: 2,
        aspect,
        _temp: true,
        _progress: 0,
      })
      const publicUrl = await uploadWithProgress(
        new File([resized], resized.name, { type: contentType }),
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
      URL.revokeObjectURL(previewUrl)
    } catch (e) {
      console.error('image upload failed', e)
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
      <button type="button" style={buttonStyle} onClick={() => fileInputRef.current?.click()}>
        image
      </button>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImagePicked(f); e.target.value = '' }} />

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
