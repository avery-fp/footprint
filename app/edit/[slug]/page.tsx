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
import { getTheme } from '@/lib/themes'
import Link from 'next/link'

// Extended content type that tracks source table
interface TileContent extends DraftContent {
  source?: 'library' | 'links'
}

// Sortable tile wrapper - CSS GRID STYLE
function SortableTile({ id, content, onDelete, deleting }: { id: string; content: any; onDelete: () => void; deleting: boolean }) {
  const [isMuted, setIsMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)

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

  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative"
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
          content.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i) ? (
            <div className="relative">
              <video
                ref={videoRef}
                src={content.url}
                className="w-full object-cover rounded-2xl cursor-pointer"
                autoPlay
                muted
                loop
                playsInline
                onClick={handleVideoClick}
              />
              {!isMuted && (
                <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60"></div>
              )}
            </div>
          ) : (
            <img
              src={content.url}
              className="w-full object-cover rounded-2xl"
              alt=""
              loading="lazy"
            />
          )
        ) : (
          <ContentCard content={content} />
        )}
      </div>
    </div>
  )
}

export default function EditPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [draft, setDraft] = useState<DraftFootprint | null>(null)
  const [pasteUrl, setPasteUrl] = useState('')
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
  const [showPasteInput, setShowPasteInput] = useState(false)

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

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
          const content = (data.tiles || [])
            .filter((tile: any) => tile && tile.id && tile.url) // Filter out null/undefined items
            .map((tile: any) => {
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

          // Load rooms from API
          if (data.rooms && data.rooms.length > 0) {
            setRooms(data.rooms)
          }

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
    } catch (e) {
      console.error('Failed to add content:', e)
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
        color: theme.text,
      }
    : {
        background: theme.bg,
        color: theme.text,
      }

  return (
    <div className="min-h-screen pb-32" style={backgroundStyle}>
      {/* Header - Left: view, Right: Edit */}
      <div className="fixed top-6 left-6 z-50">
        <Link
          href={`/${slug}`}
          className="text-sm text-white/60 hover:text-white/90 transition font-mono"
        >
          ← view
        </Link>
      </div>

      <div className="fixed top-6 right-6 z-50">
        <span className="text-sm font-medium text-white/90">
          Edit
        </span>
      </div>

      {/* Room Tabs - Fixed at top-14 */}
      {rooms.length > 0 && (
        <div className="fixed top-14 left-0 right-0 z-40 flex items-center justify-center gap-2 py-2 px-4 bg-gradient-to-b from-black/60 to-transparent overflow-x-auto">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setActiveRoomId(room.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition whitespace-nowrap ${
                activeRoomId === room.id
                  ? 'bg-white/20 text-white'
                  : 'bg-transparent border border-white/20 text-white/60 hover:text-white'
              }`}
            >
              {room.name}
            </button>
          ))}
          <button className="px-3 py-1.5 rounded-full border border-white/20 text-white/60 hover:text-white">
            +
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-20">

        {/* CSS Grid - Golden Build Style */}
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {draft.content
                  .filter(item => item && item.id && item.url) // Extra safety: filter null items
                  .map(item => (
                    <SortableTile
                      key={item.id}
                      id={item.id}
                      content={item}
                      onDelete={() => handleDelete(item.id)}
                      deleting={deletingIds.has(item.id)}
                    />
                  ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="text-center py-32">
            <p className="text-white/30 text-lg mb-4">Empty room</p>
            <p className="text-white/20 text-sm font-mono">Paste a URL below to add your first tile</p>
          </div>
        )}
      </div>

      {/* Glass Pill Bottom Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        {showPasteInput ? (
          <div className="relative">
            <input
              type="text"
              placeholder="Paste URL..."
              value={pasteUrl}
              onChange={e => setPasteUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleAddContent()
                  setShowPasteInput(false)
                } else if (e.key === 'Escape') {
                  setShowPasteInput(false)
                  setPasteUrl('')
                }
              }}
              onBlur={() => {
                if (!pasteUrl.trim()) setShowPasteInput(false)
              }}
              autoFocus
              className="w-80 px-6 py-3 pr-14 bg-black/50 backdrop-blur-xl border border-white/10 rounded-full font-mono text-sm focus:border-white/40 focus:outline-none text-white placeholder:text-white/30"
            />
            <button
              onClick={() => {
                handleAddContent()
                setShowPasteInput(false)
              }}
              disabled={isAdding || !pasteUrl.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 transition flex items-center justify-center text-xl"
            >
              +
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4 bg-black/50 backdrop-blur-xl rounded-full px-6 py-3 border border-white/10">
            <button
              onClick={() => setShowPasteInput(true)}
              className="text-white/80 hover:text-white transition text-xl"
              title="Add content"
            >
              +
            </button>
            <button
              className="text-white/80 hover:text-white transition text-xl"
              title="Add link"
            >
              🔗
            </button>
            <button
              className="text-white/80 hover:text-white transition text-xl"
              title="Add thought"
            >
              💬
            </button>
          </div>
        )}
      </div>

      {/* Wallpaper Picker Modal */}
      {showWallpaperPicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowWallpaperPicker(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
          <div
            className="relative bg-black/80 backdrop-blur-xl border border-white/20 rounded-2xl p-6 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium text-white/90 mb-4">Wallpaper Settings</h3>

            <div className="space-y-4">
              {/* URL Input */}
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

              {/* Blur Toggle */}
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

              {/* Buttons */}
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
