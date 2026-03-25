'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { saveDraft, loadDraft, DraftContent, DraftFootprint } from '@/lib/draft-store'
import { extractYouTubeId } from '@/lib/parseEmbed'
import { isVideoFile } from '@/lib/upload'

const SANDBOX_SLUG = '_sandbox'

// ─── Sortable tile wrapper ───
function SandboxTile({
  tile,
  onRemove,
}: {
  tile: DraftContent & { _dataUrl?: string }
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: tile.id })

  const style: React.CSSProperties = {
    ...(isDragging && transform
      ? {
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
          zIndex: 50,
          scale: '1.05',
        }
      : {}),
    opacity: isDragging ? 0.8 : 1,
  }

  const isYouTube = tile.type === 'youtube'
  const isVideo =
    tile.type === 'video' ||
    (tile.type === 'image' && /\.(mp4|mov|webm|m4v)($|\?)/i.test(tile.url || ''))

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="aspect-square rounded-xl overflow-hidden relative group cursor-grab active:cursor-grabbing bg-white/[0.06]"
    >
      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove(tile.id)
        }}
        className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-black/60 text-white/60 hover:text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
      >
        ×
      </button>

      {isYouTube ? (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <img
            src={tile.thumbnail_url || `https://img.youtube.com/vi/${tile.url}/hqdefault.jpg`}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center">
              <span className="text-white text-xl ml-0.5">▶</span>
            </div>
          </div>
        </div>
      ) : isVideo ? (
        <video
          src={tile.url}
          className="w-full h-full object-cover"
          muted
          playsInline
          loop
          autoPlay
        />
      ) : tile.type === 'thought' ? (
        <div className="w-full h-full flex items-center justify-center p-4 bg-white/[0.04]">
          <p className="text-white/80 text-center text-sm whitespace-pre-wrap">
            {tile.title || ''}
          </p>
        </div>
      ) : (
        <img
          src={tile.url}
          alt={tile.title || ''}
          className="w-full h-full object-cover"
        />
      )}
    </div>
  )
}

// ─── Sign-in modal ───
function SignInModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-sm rounded-2xl p-8 text-center border border-white/10"
        style={{ background: '#111' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-light text-white/90 mb-8">
          sign in to save
        </h2>
        <a
          href={`/login?redirect=${encodeURIComponent('/build')}`}
          className="block w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all mb-3"
        >
          sign in
        </a>
        <a
          href={`/signup?redirect=${encodeURIComponent('/build')}`}
          className="block w-full py-3 rounded-xl text-[14px] font-medium text-white/60 hover:text-white/80 transition-all"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          create account
        </a>
        <button
          onClick={onClose}
          className="mt-4 text-white/20 text-[11px] hover:text-white/40 transition-colors"
        >
          keep building
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// BUILD PAGE — sandbox editor
// ═══════════════════════════════════════════
export default function BuildPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [isAuth, setIsAuth] = useState(false)
  const [tiles, setTiles] = useState<(DraftContent & { _dataUrl?: string })[]>([])
  const [pasteUrl, setPasteUrl] = useState('')
  const [showSignIn, setShowSignIn] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 4 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  const sensors = useSensors(mouseSensor, touchSensor)

  // Mobile detect
  useEffect(() => {
    setIsMobile(window.innerWidth < 768)
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Auth check — if logged in, redirect to their editor
  useEffect(() => {
    async function checkAuth() {
      try {
        const fpRes = await fetch('/api/footprint-for-user')
        if (fpRes.ok) {
          const data = await fpRes.json()
          if (data.slug) {
            // Authenticated — transfer any sandbox draft tiles then redirect
            const sandboxDraft = loadDraft(SANDBOX_SLUG)
            if (sandboxDraft && sandboxDraft.content.length > 0) {
              // Store sandbox content for restoration after redirect
              try {
                localStorage.setItem('fp:sandbox-transfer', JSON.stringify(sandboxDraft.content))
              } catch {}
            }
            setIsAuth(true)
            router.push(`/${data.slug}/home`)
            return
          }
        }
      } catch {}
      setAuthChecked(true)
    }
    checkAuth()
  }, [router])

  // Load existing sandbox draft from localStorage
  useEffect(() => {
    if (!authChecked) return
    const draft = loadDraft(SANDBOX_SLUG)
    if (draft && draft.content.length > 0) {
      setTiles(draft.content)
    }
  }, [authChecked])

  // Persist tiles to localStorage on change
  useEffect(() => {
    if (!authChecked || isAuth) return
    const draft: DraftFootprint = {
      slug: SANDBOX_SLUG,
      display_name: '',
      handle: '',
      bio: '',
      theme: 'midnight',
      grid_mode: 'grid',
      avatar_url: null,
      content: tiles,
      updated_at: Date.now(),
    }
    saveDraft(SANDBOX_SLUG, draft)
  }, [tiles, authChecked, isAuth])

  // Handle file upload — store as data URL
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length === 0) return

      // 50MB per-file limit
      const oversized = files.filter((f) => f.size > 50 * 1024 * 1024)
      if (oversized.length > 0) {
        alert('under 50mb.')
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }

      files.forEach((file, idx) => {
        const reader = new FileReader()
        const isVideo = isVideoFile(file)

        reader.onload = () => {
          const dataUrl = reader.result as string
          const newTile: DraftContent & { _dataUrl?: string } = {
            id: `sandbox-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
            url: dataUrl,
            type: isVideo ? 'video' : 'image',
            title: file.name,
            description: null,
            thumbnail_url: null,
            embed_html: null,
            position: tiles.length + idx,
            _dataUrl: dataUrl,
          }
          setTiles((prev) => [...prev, newTile])
        }
        reader.readAsDataURL(file)
      })

      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [tiles.length]
  )

  // Handle paste YouTube link
  const handleAddLink = useCallback(() => {
    const url = pasteUrl.trim()
    if (!url) return

    const ytId = extractYouTubeId(url)
    if (ytId) {
      const newTile: DraftContent = {
        id: `sandbox-yt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: ytId,
        type: 'youtube',
        title: 'YouTube',
        description: null,
        thumbnail_url: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        embed_html: null,
        position: tiles.length,
      }
      setTiles((prev) => [...prev, newTile])
    } else {
      // Generic link
      const newTile: DraftContent = {
        id: `sandbox-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: url,
        type: 'link',
        title: url,
        description: null,
        thumbnail_url: null,
        embed_html: null,
        position: tiles.length,
      }
      setTiles((prev) => [...prev, newTile])
    }
    setPasteUrl('')
  }, [pasteUrl, tiles.length])

  // Remove tile
  const removeTile = useCallback((id: string) => {
    setTiles((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Drag end — reorder
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      setTiles((prev) => {
        const oldIndex = prev.findIndex((t) => t.id === active.id)
        const newIndex = prev.findIndex((t) => t.id === over.id)
        if (oldIndex === -1 || newIndex === -1) return prev
        return arrayMove(prev, oldIndex, newIndex).map((t, i) => ({
          ...t,
          position: i,
        }))
      })
    },
    []
  )

  // Loading state
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] relative flex flex-col" style={{ background: '#0a0a0a' }}>
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 md:px-6 py-4">
        <a href="/" className="text-white/40 text-[11px] font-mono tracking-[0.15em] hover:text-white/60 transition-colors">
          footprint
        </a>
        <button
          onClick={() => setShowSignIn(true)}
          className="text-[13px] text-white/60 hover:text-white/90 transition font-mono flex items-center justify-center px-5 py-2 rounded-full border border-white/[0.10] hover:border-white/25"
          style={{ background: 'rgba(255, 255, 255, 0.04)' }}
        >
          save
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 pt-20 pb-32 px-3 md:px-6">
        <div className="mx-auto w-full" style={{ maxWidth: '880px' }}>
          {/* Empty state */}
          {tiles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-8 py-3 rounded-full bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-all"
              >
                upload
              </button>
            </div>
          )}

          {/* Tile grid */}
          {tiles.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={tiles.map((t) => t.id)}
                strategy={rectSortingStrategy}
              >
                <div
                  className="grid grid-cols-2 md:grid-cols-4"
                  style={{ gap: '3px', gridAutoFlow: 'dense' }}
                >
                  {tiles.map((tile) => (
                    <SandboxTile
                      key={tile.id}
                      tile={tile}
                      onRemove={removeTile}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <div className="flex flex-col items-center gap-3">
          {/* URL input */}
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full border border-white/10 overflow-hidden px-1">
            <input
              type="text"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddLink()
              }}
              placeholder="paste YouTube link"
              className="bg-transparent text-white/80 placeholder:text-white/25 text-[13px] font-mono px-4 py-3 focus:outline-none w-48 md:w-64"
            />
            {pasteUrl.trim() && (
              <button
                onClick={handleAddLink}
                className="text-[11px] font-mono text-white/60 hover:text-white px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-all mr-1"
              >
                add
              </button>
            )}
          </div>

          {/* Action pills */}
          <div className="flex items-center gap-0 bg-black/50 backdrop-blur-sm rounded-full border border-white/20 overflow-hidden">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-14 h-14 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
            >
              <span className="text-white/60 text-sm font-bold">↑</span>
            </button>
            <div className="w-px h-6 bg-white/10" />
            <button
              onClick={() => {
                const input = document.getElementById('sandbox-url-input')
                if (input) input.focus()
              }}
              className="w-14 h-14 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white/60"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Sign-in modal */}
      {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
    </div>
  )
}
