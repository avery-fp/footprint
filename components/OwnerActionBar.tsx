'use client'

import { useEffect, useRef, useState } from 'react'
import { uploadWithProgress, resizeImage, detectImageAspect } from '@/lib/upload'

/**
 * OwnerActionBar — the verbs of creation.
 *
 * Visible only when the corner home button is toggled on. Holds the four
 * creation flows (link, text, collection, image upload) plus the eye toggle
 * for the page's published state. Each flow mirrors the editor's existing
 * optimistic-update-plus-server-POST pattern: the new tile lands in
 * `localContent` immediately, the API call fires async, no draft buffer.
 */

type Verb = 'idle' | 'link' | 'text' | 'collection' | 'image'

interface OwnerActionBarProps {
  open: boolean
  slug: string
  activeRoomId: string | null
  serialNumber: number | null
  published: boolean
  onPublishedChange: (next: boolean) => void
  onTileAdded: (tile: any) => void
  /**
   * Replace a temp tile id (assigned during optimistic insert) with the
   * real server-returned tile. Used by the image flow where a placeholder
   * appears while the upload is in flight.
   */
  onTileReplaced: (tempId: string, real: any) => void
  /**
   * Update an in-flight tile's progress (0-100) so the optimistic
   * placeholder can render an upload progress affordance.
   */
  onTileProgress: (tempId: string, pct: number) => void
}

const glassBar: React.CSSProperties = {
  background: 'rgba(0,0,0,0.6)',
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
  published,
  onPublishedChange,
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
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  // Reset to idle whenever the bar closes so the next open is clean.
  useEffect(() => {
    if (!open) {
      setVerb('idle')
      setLinkUrl('')
      setThoughtText('')
      setContainerLabel('')
    }
  }, [open])

  // Autofocus the input that just opened so the keyboard surfaces on mobile.
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
      setVerb('idle')
    } catch (e) {
      console.error('image upload failed', e)
    } finally {
      setBusy(false)
    }
  }

  const verbBtnBase: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.7)',
    width: 40,
    height: 40,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    borderRadius: 999,
  }
  const verbActive: React.CSSProperties = {
    ...verbBtnBase,
    background: 'rgba(255,255,255,0.10)',
    color: 'rgba(255,255,255,0.95)',
  }

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-1.5 font-mono"
      style={{
        ...glassBar,
        // Sit above the corner home button (bottom: 16, height: 40) so
        // both stay tappable while the bar is open. 16 + 40 + 12 gap.
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)',
        maxWidth: 'min(560px, calc(100vw - 32px))',
      }}
      data-owner-action-bar
    >
      {/* The four verbs of creation. */}
      <button
        type="button"
        aria-label="add link"
        style={verb === 'link' ? verbActive : verbBtnBase}
        onClick={() => setVerb(verb === 'link' ? 'idle' : 'link')}
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="add text"
        style={verb === 'text' ? verbActive : verbBtnBase}
        onClick={() => setVerb(verb === 'text' ? 'idle' : 'text')}
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="add collection"
        style={verb === 'collection' ? verbActive : verbBtnBase}
        onClick={() => setVerb(verb === 'collection' ? 'idle' : 'collection')}
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5h16.5M3.75 12h16.5M3.75 16.5h10.5" />
          <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="add image"
        style={verb === 'image' ? verbActive : verbBtnBase}
        onClick={() => fileInputRef.current?.click()}
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleImagePicked(file)
          e.target.value = ''
        }}
      />

      {/* Divider before the published toggle. */}
      <span className="mx-1" style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.10)' }} />

      <button
        type="button"
        aria-label={published ? 'set private' : 'set public'}
        title={published ? 'public' : 'private'}
        style={verbBtnBase}
        onClick={() => onPublishedChange(!published)}
      >
        {published ? (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ) : (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
          </svg>
        )}
      </button>

      {/* Inline input panel — slides in below the verb row. */}
      {verb !== 'idle' && verb !== 'image' && (
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
              <input
                ref={(el) => { inputRef.current = el }}
                type="url"
                inputMode="url"
                placeholder="paste any link…"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitLink() }}
                className="flex-1 bg-transparent text-white/80 placeholder-white/30 outline-none text-sm"
              />
              <button
                onClick={submitLink}
                disabled={!linkUrl.trim() || busy}
                className="text-xs text-white/60 hover:text-white/90 px-2 py-1 disabled:opacity-30"
              >
                {busy ? '…' : 'add'}
              </button>
            </>
          )}
          {verb === 'text' && (
            <>
              <input
                ref={(el) => { inputRef.current = el }}
                type="text"
                placeholder="a thought…"
                value={thoughtText}
                onChange={(e) => setThoughtText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitThought() }}
                className="flex-1 bg-transparent text-white/80 placeholder-white/30 outline-none text-sm"
              />
              <button
                onClick={submitThought}
                disabled={!thoughtText.trim() || busy}
                className="text-xs text-white/60 hover:text-white/90 px-2 py-1 disabled:opacity-30"
              >
                {busy ? '…' : 'add'}
              </button>
            </>
          )}
          {verb === 'collection' && (
            <>
              <input
                ref={(el) => { inputRef.current = el }}
                type="text"
                placeholder="collection name…"
                value={containerLabel}
                onChange={(e) => setContainerLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitContainer() }}
                className="flex-1 bg-transparent text-white/80 placeholder-white/30 outline-none text-sm"
              />
              <button
                onClick={submitContainer}
                disabled={!containerLabel.trim() || busy}
                className="text-xs text-white/60 hover:text-white/90 px-2 py-1 disabled:opacity-30"
              >
                {busy ? '…' : 'add'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
