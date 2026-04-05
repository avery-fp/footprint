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

// ─── Ghost tile with pulse animation ───
function SandboxTile({
  tile,
  onRemove,
  isNew,
}: {
  tile: DraftContent & { _dataUrl?: string }
  onRemove: (id: string) => void
  isNew?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: tile.id })
  const [pulsing, setPulsing] = useState(isNew)

  useEffect(() => {
    if (isNew) {
      const t = setTimeout(() => setPulsing(false), 600)
      return () => clearTimeout(t)
    }
  }, [isNew])

  const style: React.CSSProperties = {
    ...(isDragging && transform
      ? {
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
          zIndex: 50,
          scale: '1.05',
        }
      : {}),
    opacity: isDragging ? 0.7 : 1,
  }

  const isYouTube = tile.type === 'youtube'
  const isSpotify = tile.type === 'spotify'
  const isVideo =
    tile.type === 'video' ||
    (tile.type === 'image' && /\.(mp4|mov|webm|m4v)($|\?)/i.test(tile.url || ''))

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        aspect-square rounded-2xl overflow-hidden relative group cursor-grab active:cursor-grabbing
        bg-white/[0.04] backdrop-blur-sm
        border border-white/[0.06] hover:border-white/[0.12]
        transition-all duration-300 ease-out
        ${pulsing ? 'animate-tile-pulse' : ''}
      `}
    >
      {/* Remove — appears on hover/touch */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove(tile.id)
        }}
        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/70 backdrop-blur-sm text-white/50 hover:text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all duration-200"
      >
        ×
      </button>

      {isYouTube ? (
        <div className="w-full h-full flex items-center justify-center bg-black/40">
          <img
            src={tile.thumbnail_url || `https://img.youtube.com/vi/${tile.url}/hqdefault.jpg`}
            alt=""
            className="w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
              <span className="text-white/80 text-sm ml-0.5">▶</span>
            </div>
          </div>
        </div>
      ) : isSpotify ? (
        <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a]">
          <div className="flex flex-col items-center gap-2">
            <span className="text-[#1DB954] text-2xl">♫</span>
            <span className="text-white/30 text-[10px] font-mono">spotify</span>
          </div>
        </div>
      ) : isVideo ? (
        <video
          src={tile.url}
          className="w-full h-full object-cover opacity-90"
          muted
          playsInline
          loop
          autoPlay
        />
      ) : tile.type === 'thought' ? (
        <div className="w-full h-full flex items-center justify-center p-4">
          <p className="text-white/60 text-center text-[13px] leading-relaxed whitespace-pre-wrap font-light">
            {tile.title || ''}
          </p>
        </div>
      ) : tile.type === 'link' ? (
        <div className="w-full h-full flex items-center justify-center p-4">
          <span className="text-white/30 text-[11px] font-mono break-all line-clamp-3">{tile.url}</span>
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-8 pt-10 text-center border border-white/[0.08] border-b-0 sm:border-b"
        style={{ background: '#0a0a0a' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-8 h-0.5 bg-white/20 rounded-full mx-auto mb-8 sm:hidden" />
        <h2 className="text-lg font-light text-white/80 mb-8 tracking-wide">
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
          className="block w-full py-3 rounded-xl text-[14px] font-medium text-white/50 hover:text-white/70 transition-all bg-white/[0.04] border border-white/[0.06]"
        >
          create account
        </a>
        <button
          onClick={onClose}
          className="mt-6 text-white/20 text-[11px] hover:text-white/40 transition-colors"
        >
          keep building
        </button>
      </div>
    </div>
  )
}

// ─── Upload canvas (empty state) ───
function UploadCanvas({ onTap }: { onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="
        w-full aspect-[3/4] sm:aspect-[4/3] max-w-md mx-auto
        rounded-3xl
        bg-white/[0.02] hover:bg-white/[0.04]
        border border-dashed border-white/[0.08] hover:border-white/[0.15]
        backdrop-blur-sm
        transition-all duration-500 ease-out
        flex flex-col items-center justify-center gap-4
        cursor-pointer
        group
        active:scale-[0.98]
      "
    >
      {/* Glass upload icon */}
      <div className="
        w-16 h-16 rounded-2xl
        bg-white/[0.04] group-hover:bg-white/[0.08]
        border border-white/[0.08] group-hover:border-white/[0.15]
        flex items-center justify-center
        transition-all duration-500
        backdrop-blur-sm
      ">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white/30 group-hover:text-white/50 transition-colors duration-500">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-white/20 group-hover:text-white/35 text-[12px] font-mono tracking-widest transition-colors duration-500">
        tap to add
      </span>
    </button>
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
  const [tooLarge, setTooLarge] = useState(false)
  const [newTileIds, setNewTileIds] = useState<Set<string>>(new Set())
  const [inputFocused, setInputFocused] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 4 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  const sensors = useSensors(mouseSensor, touchSensor)

  // Auth check — if logged in, redirect to their editor
  useEffect(() => {
    async function checkAuth() {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000)
        const fpRes = await fetch('/api/footprint-for-user', { signal: controller.signal })
        clearTimeout(timeout)
        if (fpRes.ok) {
          const data = await fpRes.json()
          if (data.slug) {
            const sandboxDraft = loadDraft(SANDBOX_SLUG)
            if (sandboxDraft && sandboxDraft.content.length > 0) {
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

  // Load existing sandbox draft
  useEffect(() => {
    if (!authChecked) return
    const draft = loadDraft(SANDBOX_SLUG)
    if (draft && draft.content.length > 0) {
      setTiles(draft.content)
    }
  }, [authChecked])

  // Persist tiles to localStorage
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

  // Mark new tile IDs for pulse, clear after animation
  const markNew = useCallback((ids: string[]) => {
    setNewTileIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
    setTimeout(() => {
      setNewTileIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    }, 700)
  }, [])

  // Handle file upload — instant ghost tile
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length === 0) return

      const oversized = files.filter((f) => f.size > 50 * 1024 * 1024)
      if (oversized.length > 0) {
        setTooLarge(true)
        setTimeout(() => setTooLarge(false), 3000)
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }

      const addedIds: string[] = []

      files.forEach((file, idx) => {
        const reader = new FileReader()
        const isVideo = isVideoFile(file)
        const tileId = `sandbox-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`
        addedIds.push(tileId)

        reader.onload = () => {
          const dataUrl = reader.result as string
          const newTile: DraftContent & { _dataUrl?: string } = {
            id: tileId,
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

      markNew(addedIds)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [tiles.length, markNew]
  )

  // Handle paste link — auto-detect YouTube, Spotify, or generic
  const handleAddLink = useCallback(() => {
    const url = pasteUrl.trim()
    if (!url) return

    const tileId = `sandbox-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // Try YouTube first
    const ytId = extractYouTubeId(url)
    if (ytId) {
      const newTile: DraftContent = {
        id: tileId,
        url: ytId,
        type: 'youtube',
        title: 'YouTube',
        description: null,
        thumbnail_url: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        embed_html: null,
        position: tiles.length,
      }
      setTiles((prev) => [...prev, newTile])
      markNew([tileId])
      setPasteUrl('')
      return
    }

    // Try Spotify
    const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/)
    if (spotifyMatch) {
      const newTile: DraftContent = {
        id: tileId,
        url: url,
        type: 'spotify',
        title: 'Spotify',
        description: null,
        thumbnail_url: null,
        embed_html: null,
        position: tiles.length,
      }
      setTiles((prev) => [...prev, newTile])
      markNew([tileId])
      setPasteUrl('')
      return
    }

    // Generic link
    const newTile: DraftContent = {
      id: tileId,
      url: url,
      type: 'link',
      title: url,
      description: null,
      thumbnail_url: null,
      embed_html: null,
      position: tiles.length,
    }
    setTiles((prev) => [...prev, newTile])
    markNew([tileId])
    setPasteUrl('')
  }, [pasteUrl, tiles.length, markNew])

  // Remove tile
  const removeTile = useCallback((id: string) => {
    setTiles((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Drag reorder
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setTiles((prev) => {
      const oldIndex = prev.findIndex((t) => t.id === active.id)
      const newIndex = prev.findIndex((t) => t.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      return arrayMove(prev, oldIndex, newIndex).map((t, i) => ({ ...t, position: i }))
    })
  }, [])

  // Detect URL type for input hint
  const detectedType = (() => {
    const v = pasteUrl.trim()
    if (!v) return null
    if (/youtube\.com|youtu\.be/i.test(v)) return 'youtube'
    if (/spotify\.com/i.test(v)) return 'spotify'
    if (/^https?:\/\//i.test(v)) return 'link'
    return null
  })()

  // Loading
  if (!authChecked) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: '#050505' }}>
        <div className="w-5 h-5 border border-white/10 border-t-white/30 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] relative flex flex-col" style={{ background: '#050505' }}>
      {/* Dot grid background */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Breathing gradient */}
      <div
        className="fixed inset-0 pointer-events-none z-0 animate-breathe"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 40%, rgba(255,255,255,0.02) 0%, transparent 70%)',
        }}
      />

      {/* Header — minimal */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
        <a href="/" className="text-white/25 text-[10px] font-mono tracking-[0.2em] uppercase hover:text-white/40 transition-colors">
          footprint
        </a>
        <button
          onClick={() => setShowSignIn(true)}
          className="
            text-[12px] text-white/50 hover:text-white/80 transition-all font-mono
            px-4 py-1.5 rounded-full
            bg-white/[0.04] hover:bg-white/[0.08]
            border border-white/[0.08] hover:border-white/[0.15]
            backdrop-blur-sm
          "
        >
          save
        </button>
      </div>

      {/* Main canvas */}
      <div className="flex-1 pt-16 pb-40 px-3 relative z-10">
        <div className="mx-auto w-full" style={{ maxWidth: '640px' }}>

          {/* Empty state — canvas waiting */}
          {tiles.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60dvh]">
              {tooLarge ? (
                <span className="text-white/30 text-[12px] font-mono animate-pulse">file too large</span>
              ) : (
                <UploadCanvas onTap={() => fileInputRef.current?.click()} />
              )}
            </div>
          )}

          {/* Tile grid */}
          {tiles.length > 0 && (
            <>
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
                    className="grid grid-cols-2 sm:grid-cols-3"
                    style={{ gap: '3px' }}
                  >
                    {tiles.map((tile) => (
                      <SandboxTile
                        key={tile.id}
                        tile={tile}
                        onRemove={removeTile}
                        isNew={newTileIds.has(tile.id)}
                      />
                    ))}

                    {/* Add more tile — glass tile aesthetic */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="
                        aspect-square rounded-2xl overflow-hidden
                        bg-white/[0.02] hover:bg-white/[0.05]
                        border border-dashed border-white/[0.06] hover:border-white/[0.12]
                        transition-all duration-300
                        flex items-center justify-center
                        cursor-pointer
                        active:scale-95
                      "
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white/15 hover:text-white/30 transition-colors">
                        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </SortableContext>
              </DndContext>
            </>
          )}
        </div>
      </div>

      {/* Bottom input — paste link */}
      <div className="fixed bottom-0 left-0 right-0 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="px-4 pb-6 pt-3">
          <div className="mx-auto" style={{ maxWidth: '480px' }}>
            <div className={`
              flex items-center
              rounded-2xl
              bg-white/[0.03] backdrop-blur-xl
              border transition-all duration-300
              ${inputFocused ? 'border-white/[0.15] bg-white/[0.05]' : 'border-white/[0.06]'}
              overflow-hidden
            `}>
              <input
                ref={inputRef}
                type="text"
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddLink()
                }}
                placeholder="paste a link"
                className="
                  flex-1 bg-transparent text-white/70 placeholder:text-white/15
                  text-[13px] font-mono px-5 py-4
                  focus:outline-none
                "
              />

              {/* Type indicator */}
              {detectedType && (
                <span className={`
                  text-[10px] font-mono mr-2 px-2 py-0.5 rounded-full
                  ${detectedType === 'youtube' ? 'text-red-400/60 bg-red-400/10' : ''}
                  ${detectedType === 'spotify' ? 'text-green-400/60 bg-green-400/10' : ''}
                  ${detectedType === 'link' ? 'text-white/30 bg-white/5' : ''}
                `}>
                  {detectedType}
                </span>
              )}

              {pasteUrl.trim() ? (
                <button
                  onClick={handleAddLink}
                  className="text-white/40 hover:text-white/70 px-4 py-4 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="rotate-[-90deg]">
                    <path d="M12 5v14M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-white/20 hover:text-white/40 px-4 py-4 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" opacity="0.5" />
                    <path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
                  </svg>
                </button>
              )}
            </div>
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
