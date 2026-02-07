'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { loadDraft, saveDraft, clearDraft, DraftFootprint, DraftContent } from '@/lib/draft-store'
import ContentCard from '@/components/ContentCard'
import { audioManager } from '@/lib/audio-manager'
import { getTheme } from '@/lib/themes'
import Link from 'next/link'

interface TileContent extends DraftContent {
  source?: 'library' | 'links'
}

// ═══════════════════════════════════════════
// Sortable Tile
// ═══════════════════════════════════════════
function SortableTile({
  id, content, onDelete, onSelect, deleting, selected,
}: {
  id: string
  content: any
  onDelete: () => void
  onSelect: () => void
  deleting: boolean
  selected: boolean
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
      className="aspect-square"
      {...attributes}
      {...listeners}
      onClick={onSelect}
    >
      <div className={`relative rounded-xl overflow-hidden w-full h-full ${selected ? 'ring-2 ring-green-400' : ''}`}>
        {/* Red dot delete */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute top-2 left-2 w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 z-10 transition-all"
          title="Delete"
        />

        {/* Green checkmark when selected */}
        {selected && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center z-10">
            <span className="text-white text-xs font-bold">✓</span>
          </div>
        )}

        {/* Tile content — absolute fill to enforce square */}
        {content.type === 'image' ? (
          isVideo ? (
            <>
              <video
                ref={videoRef}
                src={content.url}
                className={`absolute inset-0 w-full h-full object-cover cursor-pointer transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                muted
                playsInline
                preload="metadata"
                onClick={handleVideoClick}
                onLoadedData={() => setIsLoaded(true)}
              />
              {!isMuted && (
                <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60 z-10" />
              )}
            </>
          ) : (
            <img
              src={content.url}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
              alt=""
              loading="lazy"
              onLoad={() => setIsLoaded(true)}
            />
          )
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/[0.05] p-2">
            <div className="text-2xl mb-1 opacity-60">
              {content.type === 'youtube' ? '▶' : content.type === 'spotify' ? '♫' : content.type === 'soundcloud' ? '♫' : content.type === 'thought' ? '💭' : '🔗'}
            </div>
            <p className="text-[10px] text-white/50 text-center truncate w-full font-mono">
              {content.title || content.type}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// EDIT PAGE
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
  const [wallpaperUrl, setWallpaperUrl] = useState('')
  const [backgroundBlur, setBackgroundBlur] = useState(true)
  // Selection state
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)

  // Bottom pill input state
  const [pillMode, setPillMode] = useState<'idle' | 'url' | 'thought'>('idle')
  const [pasteUrl, setPasteUrl] = useState('')
  const [thoughtText, setThoughtText] = useState('')
  const urlInputRef = useRef<HTMLInputElement>(null)
  const thoughtInputRef = useRef<HTMLTextAreaElement>(null)

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Activation constraint: require 8px drag distance so clicks still work
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Load data
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
          setWallpaperUrl(data.footprint.background_url || '')
          setBackgroundBlur(data.footprint.background_blur ?? true)

          const sources: Record<string, 'library' | 'links'> = {}
          const content = (data.tiles || []).map((tile: any) => {
            sources[tile.id] = tile.source
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
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => saveData(draft), 500)
      return () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [draft, isLoading, saveData])

  useEffect(() => {
    if (pillMode === 'url') {
      setTimeout(() => urlInputRef.current?.focus(), 100)
    } else if (pillMode === 'thought') {
      setTimeout(() => thoughtInputRef.current?.focus(), 100)
    }
  }, [pillMode])

  // ── Tile actions ──

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
    if (selectedTileId === id) setSelectedTileId(null)

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
        throw new Error(error.error || 'Delete failed')
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

  // ── Wallpaper from tile ──

  async function handleSetWallpaper() {
    if (!selectedTileId || !draft) return
    const tile = draft.content.find(c => c.id === selectedTileId)
    if (!tile) return

    // Use the tile's image URL (or thumbnail for embeds)
    const imageUrl = tile.type === 'image' ? tile.url : tile.thumbnail_url
    if (!imageUrl) return

    try {
      await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background_url: imageUrl }),
      })
      setWallpaperUrl(imageUrl)
      setSelectedTileId(null)
    } catch (e) {
      console.error('Failed to set wallpaper:', e)
    }
  }

  async function handleClearWallpaper() {
    try {
      await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background_url: '' }),
      })
      setWallpaperUrl('')
    } catch (e) {
      console.error('Failed to clear wallpaper:', e)
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

  // ── Selection helpers ──

  function handleSelect(id: string) {
    setSelectedTileId(prev => prev === id ? null : id)
    setPillMode('idle')
  }

  const selectedTile = draft?.content.find(c => c.id === selectedTileId)
  const selectedIsImage = selectedTile?.type === 'image' && !selectedTile?.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)
  const selectedHasThumbnail = selectedTile?.thumbnail_url

  // ── Render ──

  if (isLoading || !draft) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07080A]">
        <div className="font-mono text-white/50 animate-pulse">Loading...</div>
      </div>
    )
  }

  const theme = getTheme(draft.theme)

  return (
    <div className="min-h-screen pb-32 relative" style={{ background: theme.colors.background, color: theme.colors.text }}>
      {/* Wallpaper layer — real blur via filter */}
      {wallpaperUrl && (
        <div
          className="fixed inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${wallpaperUrl})`,
            filter: backgroundBlur ? 'blur(20px) brightness(0.7)' : 'none',
            transform: 'scale(1.1)',
          }}
        />
      )}
      {/* ═══ HEADER ═══ */}
      <div className="fixed top-6 left-6 z-50 flex items-center gap-3">
        <Link
          href={`/${slug}`}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white/90 transition font-mono"
        >
          ← view
        </Link>
        {/* Blur toggle — only when wallpaper is active */}
        {wallpaperUrl && (
          <button
            onClick={handleToggleBlur}
            className={`px-3 py-1 rounded-full text-xs font-mono transition border ${
              backgroundBlur
                ? 'bg-white/20 text-white/90 border-white/30'
                : 'bg-white/5 text-white/40 border-white/10'
            }`}
          >
            blur {backgroundBlur ? 'on' : 'off'}
          </button>
        )}
        {wallpaperUrl && (
          <button
            onClick={handleClearWallpaper}
            className="px-3 py-1 rounded-full text-xs font-mono text-red-400/80 hover:text-red-400 border border-red-400/20 hover:border-red-400/40 transition"
          >
            clear bg
          </button>
        )}
      </div>

      {/* Center: Room Tabs */}
      {rooms.length > 0 && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-2 border border-white/10">
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
          <button className="font-mono text-xs px-2 py-1 rounded-full text-white/30 hover:text-white/60 transition">
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

      {/* ═══ DENSE MASONRY GRID ═══ */}
      <div className="max-w-7xl mx-auto px-2 pt-14 relative z-10">
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
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {draft.content.map(item => (
                  <SortableTile
                    key={item.id}
                    id={item.id}
                    content={item}
                    onDelete={() => handleDelete(item.id)}
                    onSelect={() => handleSelect(item.id)}
                    deleting={deletingIds.has(item.id)}
                    selected={selectedTileId === item.id}
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

      {/* ═══ BOTTOM BAR ═══ */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3">

        {/* Expanded URL input */}
        {pillMode === 'url' && !selectedTileId && (
          <div className="w-80 bg-black/60 backdrop-blur-sm border border-white/20 rounded-2xl p-3 materialize">
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

        {/* Expanded thought input */}
        {pillMode === 'thought' && !selectedTileId && (
          <div className="w-80 bg-black/60 backdrop-blur-sm border border-white/20 rounded-2xl p-3 materialize">
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

        {/* CONTEXTUAL BAR: when a tile is selected → Wallpaper | Delete */}
        {selectedTileId ? (
          <div className="flex items-center gap-4 bg-black/60 backdrop-blur-sm rounded-full border border-white/20 px-6 py-3">
            {(selectedIsImage || selectedHasThumbnail) && (
              <button
                onClick={handleSetWallpaper}
                className="flex items-center gap-2 text-white/80 hover:text-white transition"
              >
                <span className="text-sm font-mono">Wallpaper</span>
              </button>
            )}
            {(selectedIsImage || selectedHasThumbnail) && (
              <div className="w-px h-4 bg-white/20" />
            )}
            <button
              onClick={() => {
                handleDelete(selectedTileId)
                setSelectedTileId(null)
              }}
              className="flex items-center gap-2 text-red-400 hover:text-red-300 transition"
            >
              <span className="text-sm font-mono">Delete</span>
            </button>
          </div>
        ) : (
          /* DEFAULT PILL: + | link | chat */
          <div className="flex items-center gap-0 bg-black/50 backdrop-blur-sm rounded-full border border-white/20 overflow-hidden">
            <button
              onClick={() => setPillMode(pillMode === 'url' ? 'idle' : 'url')}
              className={`w-14 h-14 flex items-center justify-center transition-all ${
                pillMode === 'url' ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
              title="Add content"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <div className="w-px h-6 bg-white/10" />
            <button
              onClick={() => setPillMode(pillMode === 'thought' ? 'idle' : 'thought')}
              className={`w-14 h-14 flex items-center justify-center transition-all ${
                pillMode === 'thought' ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
              title="Add thought"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
