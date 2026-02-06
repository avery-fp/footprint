'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { nanoid } from 'nanoid'
import { parseURL } from '@/lib/parser'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { loadDraft, saveDraft, clearDraft, DraftFootprint, DraftContent } from '@/lib/draft-store'
import ContentCard from '@/components/ContentCard'
import { audioManager } from '@/lib/audio-manager'
import { getTheme } from '@/lib/themes'
import Link from 'next/link'

// Extended content type that tracks source table
interface TileContent extends DraftContent {
  source?: 'library' | 'links'
}

// Determine if a content type is inherently widescreen
function isWidescreenType(type: string, url?: string): boolean {
  if (['youtube', 'vimeo', 'video'].includes(type)) return true
  // Videos stored as 'image' type in library table
  if (type === 'image' && url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)) return true
  return false
}

// ═══════════════════════════════════════════
// Sortable Tile — with Vapor Box + Materialization + AudioManager
// ═══════════════════════════════════════════
function SortableTile({
  id, content, onDelete, deleting, isWidescreen, onWidescreen,
}: {
  id: string
  content: any
  onDelete: () => void
  deleting: boolean
  isWidescreen: boolean
  onWidescreen: (id: string) => void
}) {
  const [isMuted, setIsMuted] = useState(true)
  const [isLoaded, setIsLoaded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioIdRef = useRef(`edit-${id}`)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : deleting ? 0.5 : 1,
  }

  const isVideo = content.type === 'image' && content.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)

  // Register native videos with AudioManager
  useEffect(() => {
    if (!isVideo) return
    audioManager.register(audioIdRef.current, () => {
      if (videoRef.current) {
        videoRef.current.muted = true
        setIsMuted(true)
      }
    })
    return () => audioManager.unregister(audioIdRef.current)
  }, [id, isVideo])

  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (videoRef.current) {
      if (isMuted) {
        audioManager.play(audioIdRef.current)
        videoRef.current.muted = false
        setIsMuted(false)
      } else {
        audioManager.mute(audioIdRef.current)
        videoRef.current.muted = true
        setIsMuted(true)
      }
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isWidescreen ? 'col-span-2' : 'col-span-1'}
      {...attributes}
      {...listeners}
    >
      <div className="relative">
        {/* Red dot delete - always visible */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute top-2 left-2 w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 z-10 transition-all"
          title="Delete"
        />

        {/* Tile content */}
        {content.type === 'image' ? (
          isVideo ? (
            <div className="relative rounded-2xl overflow-hidden">
              {/* Vapor Box */}
              <div
                className={`absolute inset-0 vapor-box rounded-2xl ${isLoaded ? 'opacity-0' : ''} transition-opacity duration-500`}
                style={{ aspectRatio: '16/9' }}
              />
              <video
                ref={videoRef}
                src={content.url}
                className={`w-full object-cover rounded-2xl cursor-pointer transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                autoPlay
                muted
                loop
                playsInline
                onClick={handleVideoClick}
                onLoadedData={() => setIsLoaded(true)}
              />
              {!isMuted && (
                <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60" />
              )}
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden">
              {/* Vapor Box */}
              <div
                className={`absolute inset-0 vapor-box rounded-2xl ${isLoaded ? 'opacity-0' : ''} transition-opacity duration-500`}
              />
              <img
                src={content.url}
                className={`w-full object-cover rounded-2xl transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                alt=""
                loading="lazy"
                onLoad={(e) => {
                  setIsLoaded(true)
                  const img = e.currentTarget
                  if (img.naturalWidth > img.naturalHeight * 1.3) {
                    onWidescreen(id)
                  }
                }}
              />
            </div>
          )
        ) : (
          <ContentCard
            content={content}
            onWidescreen={() => onWidescreen(id)}
          />
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// EDIT PAGE — Quantum Sovereignty Build
// ═══════════════════════════════════════════
export default function EditPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [draft, setDraft] = useState<DraftFootprint | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [isOwner, setIsOwner] = useState(false)
  const [tileSources, setTileSources] = useState<Record<string, 'library' | 'links'>>({})
  const [rooms, setRooms] = useState<any[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false)
  const [wallpaperUrl, setWallpaperUrl] = useState('')
  const [backgroundBlur, setBackgroundBlur] = useState(true)
  const [widescreenIds, setWidescreenIds] = useState<Set<string>>(new Set())

  // Bottom Glass Pill state
  const [pillMode, setPillMode] = useState<'idle' | 'url' | 'thought'>('idle')
  const [pasteUrl, setPasteUrl] = useState('')
  const [thoughtText, setThoughtText] = useState('')
  const urlInputRef = useRef<HTMLInputElement>(null)
  const thoughtInputRef = useRef<HTMLTextAreaElement>(null)

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Track widescreen tiles
  const handleWidescreen = useCallback((id: string) => {
    setWidescreenIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
          cache: 'no-store',
          next: { revalidate: 0 },
        })
        const data = await res.json()

        if (data.footprint) {
          setIsOwner(true)

          // Load wallpaper settings
          setWallpaperUrl(data.footprint.background_url || '')
          setBackgroundBlur(data.footprint.background_blur ?? true)

          const sources: Record<string, 'library' | 'links'> = {}
          const initialWidescreen = new Set<string>()
          const content = (data.tiles || []).map((tile: any) => {
            sources[tile.id] = tile.source
            if (isWidescreenType(tile.type, tile.url)) {
              initialWidescreen.add(tile.id)
            }
            return {
              id: tile.id,
              url: tile.url,
              type: tile.type,
              title: tile.title,
              description: tile.description,
              thumbnail_url: tile.thumbnail_url,
              embed_html: tile.embed_html,
              position: tile.position,
            }
          })
          setTileSources(sources)
          setWidescreenIds(initialWidescreen)

          setDraft({
            slug,
            display_name: data.footprint.display_name || '',
            handle: data.footprint.handle || '',
            bio: data.footprint.bio || '',
            theme: data.footprint.dimension || 'midnight',
            grid_mode: 'edit',
            avatar_url: data.footprint.background_url || null,
            content,
            updated_at: Date.now(),
          })

          setActiveRoomId(data.footprint.id)
        } else {
          setIsOwner(true)
          setDraft({
            slug,
            display_name: '',
            handle: '',
            bio: '',
            theme: 'midnight',
            grid_mode: 'edit',
            avatar_url: null,
            content: [],
            updated_at: Date.now(),
          })
        }
      } catch (error) {
        console.error('Failed to load footprint:', error)
        setIsOwner(true)
        setDraft({
          slug,
          display_name: '',
          handle: '',
          bio: '',
          theme: 'midnight',
          grid_mode: 'edit',
          avatar_url: null,
          content: [],
          updated_at: Date.now(),
        })
      }
      setIsLoading(false)
    }

    loadData()
  }, [slug])

  const saveData = useCallback(async (d: DraftFootprint) => {
    if (!isOwner) return
    try {
      await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: d.display_name,
          handle: d.handle,
          bio: d.bio,
          theme: d.theme,
          grid_mode: d.grid_mode,
        }),
      })
    } catch (error) {
      console.error('Failed to save profile:', error)
    }
  }, [isOwner, slug])

  useEffect(() => {
    if (draft && !isLoading) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveData(draft)
      }, 500)
      return () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
        }
      }
    }
  }, [draft, isLoading, saveData])

  // Focus input when pill mode changes
  useEffect(() => {
    if (pillMode === 'url') {
      setTimeout(() => urlInputRef.current?.focus(), 100)
    } else if (pillMode === 'thought') {
      setTimeout(() => thoughtInputRef.current?.focus(), 100)
    }
  }, [pillMode])

  async function handleAddContent() {
    if (!pasteUrl.trim() || !draft) return
    setIsAdding(true)
    try {
      const res = await fetch('/api/tiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, url: pasteUrl }),
      })
      const data = await res.json()
      if (data.tile) {
        setTileSources(prev => ({ ...prev, [data.tile.id]: data.tile.source }))
        if (isWidescreenType(data.tile.type, data.tile.url)) {
          setWidescreenIds(prev => new Set(prev).add(data.tile.id))
        }
        setDraft(prev => prev ? {
          ...prev,
          content: [...prev.content, {
            id: data.tile.id,
            url: data.tile.url,
            type: data.tile.type,
            title: data.tile.title,
            description: data.tile.description,
            thumbnail_url: data.tile.thumbnail_url,
            embed_html: data.tile.embed_html,
            position: data.tile.position,
          }],
          updated_at: Date.now(),
        } : null)
      }
      setPasteUrl('')
      setPillMode('idle')
    } catch (e) {
      console.error('Failed to add content:', e)
    } finally {
      setIsAdding(false)
    }
  }

  async function handleAddThought() {
    if (!thoughtText.trim() || !draft) return
    setIsAdding(true)
    try {
      const res = await fetch('/api/tiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, thought: thoughtText }),
      })
      const data = await res.json()
      if (data.tile) {
        setTileSources(prev => ({ ...prev, [data.tile.id]: data.tile.source }))
        setDraft(prev => prev ? {
          ...prev,
          content: [...prev.content, {
            id: data.tile.id,
            url: data.tile.url,
            type: data.tile.type,
            title: data.tile.title,
            description: data.tile.description,
            thumbnail_url: data.tile.thumbnail_url,
            embed_html: data.tile.embed_html,
            position: data.tile.position,
          }],
          updated_at: Date.now(),
        } : null)
      }
      setThoughtText('')
      setPillMode('idle')
    } catch (e) {
      console.error('Failed to add thought:', e)
    } finally {
      setIsAdding(false)
    }
  }

  async function handleDelete(id: string) {
    if (deletingIds.has(id)) return
    setDeletingIds(prev => new Set(prev).add(id))

    try {
      const source = tileSources[id]
      if (!source) throw new Error('Unknown tile source')

      const res = await fetch('/api/tiles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, source, id }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || `Delete failed`)
      }

      setDraft(prev => prev ? {
        ...prev,
        content: prev.content.filter(c => c.id !== id),
        updated_at: Date.now(),
      } : null)

      setTileSources(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })

      setWidescreenIds(prev => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } catch (error) {
      console.error('Failed to delete tile:', error)
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !draft) return

    const oldIndex = draft.content.findIndex(item => item.id === active.id)
    const newIndex = draft.content.findIndex(item => item.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const newContent = [...draft.content]
    const [moved] = newContent.splice(oldIndex, 1)
    newContent.splice(newIndex, 0, moved)

    setDraft({
      ...draft,
      content: newContent.map((item, index) => ({ ...item, position: index })),
      updated_at: Date.now(),
    })
  }

  async function handleSaveWallpaper(url: string) {
    try {
      await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background_url: url }),
      })
      setWallpaperUrl(url)
      setDraft(prev => prev ? { ...prev, avatar_url: url } : null)
      setShowWallpaperPicker(false)
    } catch (e) {
      console.error('Failed to save wallpaper:', e)
    }
  }

  async function handleToggleBlur() {
    const newBlur = !backgroundBlur
    try {
      await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background_blur: newBlur }),
      })
      setBackgroundBlur(newBlur)
    } catch (e) {
      console.error('Failed to toggle blur:', e)
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/${slug}`)
  }


  if (isLoading || !draft) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07080A]">
        <div className="font-mono text-white/50 animate-pulse">Loading...</div>
      </div>
    )
  }

  const theme = getTheme(draft.theme)

  const backgroundStyle = wallpaperUrl
    ? {
        backgroundImage: backgroundBlur
          ? `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url(${wallpaperUrl})`
          : `url(${wallpaperUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: theme.colors.text,
      }
    : {
        background: theme.colors.background,
        color: theme.colors.text,
      }

  return (
    <div className="min-h-screen pb-32" style={backgroundStyle}>
      {/* ═══ HEADER ═══ */}
      {/* Left: view + wallpaper */}
      <div className="fixed top-6 left-6 z-50 flex items-center gap-3">
        <Link
          href={`/${slug}`}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white/90 transition font-mono"
        >
          ← view
        </Link>
        <button
          onClick={() => setShowWallpaperPicker(true)}
          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white/60 hover:text-white/90 transition text-sm"
          title="Wallpaper"
        >
          🖼
        </button>
      </div>

      {/* Center: Room Tabs (pills) */}
      {rooms.length > 0 && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-black/50 backdrop-blur-xl rounded-full px-4 py-2 border border-white/10">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setActiveRoomId(room.id)}
              className={`font-mono text-xs px-3 py-1 rounded-full transition ${
                activeRoomId === room.id
                  ? 'bg-white/20 text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {room.name}
            </button>
          ))}
          <button
            className="font-mono text-xs px-2 py-1 rounded-full text-white/30 hover:text-white/60 transition"
            title="Add room"
          >
            +
          </button>
        </div>
      )}

      {/* Right: Done */}
      <div className="fixed top-6 right-6 z-50">
        <Link
          href={`/${slug}`}
          className="text-sm font-medium text-white/90 hover:text-white transition px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20"
        >
          Done
        </Link>
      </div>

      {/* ═══ MASTHEAD — æ Signature ═══ */}
      <div className="pt-20 pb-8 text-center">
        <h1 className="text-7xl sm:text-8xl font-black tracking-tighter text-white/90 leading-none">
          {draft.display_name || 'æ'}
        </h1>
      </div>

      {/* ═══ DENSE MASONRY GRID ═══ */}
      <div className="max-w-7xl mx-auto px-2">
        {draft.content.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={draft.content.map(item => item.id)}
              strategy={rectSortingStrategy}
            >
              <div
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1"
                style={{ gridAutoFlow: 'dense' }}
              >
                {draft.content.map(item => (
                  <SortableTile
                    key={item.id}
                    id={item.id}
                    content={item}
                    onDelete={() => handleDelete(item.id)}
                    deleting={deletingIds.has(item.id)}
                    isWidescreen={widescreenIds.has(item.id)}
                    onWidescreen={handleWidescreen}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="text-center py-32">
            <p className="text-white/30 text-lg mb-4">Empty room</p>
            <p className="text-white/20 text-sm font-mono">Tap + below to add your first tile</p>
          </div>
        )}
      </div>

      {/* ═══ BOTTOM GLASS PILL ═══ */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3">
        {/* Expanded input area */}
        {pillMode === 'url' && (
          <div className="w-80 bg-black/60 backdrop-blur-xl border border-white/20 rounded-2xl p-3 materialize">
            <input
              ref={urlInputRef}
              type="text"
              placeholder="Paste URL..."
              value={pasteUrl}
              onChange={e => setPasteUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddContent()
                if (e.key === 'Escape') setPillMode('idle')
              }}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl font-mono text-sm focus:border-white/30 focus:outline-none text-white placeholder:text-white/30"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAddContent}
                disabled={isAdding || !pasteUrl.trim()}
                className="flex-1 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl font-mono text-xs transition disabled:opacity-50"
              >
                {isAdding ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => { setPillMode('idle'); setPasteUrl('') }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white/60 rounded-xl font-mono text-xs transition"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {pillMode === 'thought' && (
          <div className="w-80 bg-black/60 backdrop-blur-xl border border-white/20 rounded-2xl p-3 materialize">
            <textarea
              ref={thoughtInputRef}
              placeholder="Write a thought..."
              value={thoughtText}
              onChange={e => setThoughtText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && e.metaKey) handleAddThought()
                if (e.key === 'Escape') setPillMode('idle')
              }}
              rows={3}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl font-mono text-sm focus:border-white/30 focus:outline-none text-white placeholder:text-white/30 resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAddThought}
                disabled={isAdding || !thoughtText.trim()}
                className="flex-1 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl font-mono text-xs transition disabled:opacity-50"
              >
                {isAdding ? 'Adding...' : 'Add thought'}
              </button>
              <button
                onClick={() => { setPillMode('idle'); setThoughtText('') }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white/60 rounded-xl font-mono text-xs transition"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* The Glass Pill:  +  |  🔗  |  💬  */}
        <div className="flex items-center gap-0 bg-black/50 backdrop-blur-xl rounded-full border border-white/20 overflow-hidden">
          <button
            onClick={() => setPillMode(pillMode === 'url' ? 'idle' : 'url')}
            className={`w-12 h-12 flex items-center justify-center text-lg transition-all ${
              pillMode === 'url' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
            title="Add content"
          >
            +
          </button>
          <div className="w-px h-6 bg-white/10" />
          <button
            onClick={handleCopyLink}
            className="w-12 h-12 flex items-center justify-center text-lg text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-90"
            title="Copy link"
          >
            🔗
          </button>
          <div className="w-px h-6 bg-white/10" />
          <button
            onClick={() => setPillMode(pillMode === 'thought' ? 'idle' : 'thought')}
            className={`w-12 h-12 flex items-center justify-center text-lg transition-all ${
              pillMode === 'thought' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
            title="Add thought"
          >
            💬
          </button>
        </div>
      </div>

      {/* ═══ WALLPAPER PICKER MODAL ═══ */}
      {showWallpaperPicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowWallpaperPicker(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
          <div
            className="relative bg-black/80 backdrop-blur-xl border border-white/20 rounded-2xl p-6 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium text-white/90 mb-4">Wallpaper Settings</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/60 mb-2 font-mono">Image URL</label>
                <input
                  type="text"
                  value={wallpaperUrl}
                  onChange={e => setWallpaperUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg font-mono text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm text-white/80">Background Blur</label>
                <button
                  onClick={handleToggleBlur}
                  className={`relative w-12 h-6 rounded-full transition ${
                    backgroundBlur ? 'bg-white/30' : 'bg-white/10'
                  }`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    backgroundBlur ? 'translate-x-6' : 'translate-x-0.5'
                  }`}></div>
                </button>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => handleSaveWallpaper(wallpaperUrl)}
                  className="flex-1 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg font-mono text-sm transition"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowWallpaperPicker(false)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white/60 hover:text-white rounded-lg font-mono text-sm transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
