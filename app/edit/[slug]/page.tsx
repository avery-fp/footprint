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

// Sortable tile wrapper
function SortableTile({ id, content, onDelete, deleting }: { id: string; content: any; onDelete: () => void; deleting: boolean }) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="break-inside-avoid mb-3"
      {...attributes}
      {...listeners}
    >
      {content.type === 'image' ? (
        content.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i) ? (
          <div className="relative group">
            <video
              src={content.url}
              className="w-full object-cover rounded-2xl"
              autoPlay
              muted
              loop
              playsInline
            />
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 text-white/80 hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-xl"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="relative group">
            <img
              src={content.url}
              className="w-full object-cover rounded-2xl"
              alt=""
              loading="lazy"
            />
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 text-white/80 hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-xl"
            >
              ×
            </button>
          </div>
        )
      ) : (
        <div className="relative group">
          <ContentCard content={content} />
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 text-white/80 hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-xl z-10"
          >
            ×
          </button>
        </div>
      )}
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
  const [isPublic, setIsPublic] = useState(true)
  const [isTogglingPublic, setIsTogglingPublic] = useState(false)
  const [gridMode, setGridMode] = useState<'public' | 'edit' | 'spaced'>('edit')
  const [tileSources, setTileSources] = useState<Record<string, 'library' | 'links'>>({})
  const [rooms, setRooms] = useState<any[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)

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
          setIsPublic(data.footprint.published ?? true)

          const mode = data.footprint.grid_mode || 'edit'
          setGridMode(mode)

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
            grid_mode: mode,
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

  function handleGridModeChange(mode: 'public' | 'edit' | 'spaced') {
    setGridMode(mode)
    setDraft(prev => prev ? {
      ...prev,
      grid_mode: mode,
      updated_at: Date.now(),
    } : null)
  }

  if (isLoading || !draft) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07080A]">
        <div className="font-mono text-white/50 animate-pulse">Loading...</div>
      </div>
    )
  }

  const theme = getTheme(draft.theme)
  const gapClass = gridMode === 'public' ? 'gap-2' : gridMode === 'edit' ? 'gap-3' : 'gap-4'

  return (
    <div
      className="min-h-screen pb-32"
      style={{
        background: draft.avatar_url
          ? `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url(${draft.avatar_url}) center/cover`
          : theme.bg,
        color: theme.text
      }}
    >
      {/* Back to view button - top left */}
      <div className="fixed top-6 left-6 z-50">
        <Link
          href={`/${slug}`}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white/90 transition font-mono"
        >
          ← view
        </Link>
      </div>

      {/* Public/Private toggle - top right */}
      <div className="fixed top-6 right-6 z-50">
        <button
          onClick={async () => {
            setIsTogglingPublic(true)
            try {
              await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_public: !isPublic }),
              })
              setIsPublic(!isPublic)
            } catch (e) {
              console.error(e)
            } finally {
              setIsTogglingPublic(false)
            }
          }}
          disabled={isTogglingPublic}
          className={`text-xs font-mono px-3 py-1.5 rounded-full glass transition ${
            isPublic
              ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
              : 'bg-white/10 text-white/50 hover:bg-white/20'
          } disabled:opacity-50 border border-white/10`}
        >
          {isTogglingPublic ? '...' : isPublic ? 'Public' : 'Private'}
        </button>
      </div>

      {/* Spacing toggle - top center */}
      {draft.content.length > 0 && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 glass rounded-full px-4 py-2 border border-white/10">
          <button
            onClick={() => handleGridModeChange('public')}
            className={`font-mono text-xs px-3 py-1 rounded-full transition ${
              gridMode === 'public'
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Tight
          </button>
          <button
            onClick={() => handleGridModeChange('edit')}
            className={`font-mono text-xs px-3 py-1 rounded-full transition ${
              gridMode === 'edit'
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Medium
          </button>
          <button
            onClick={() => handleGridModeChange('spaced')}
            className={`font-mono text-xs px-3 py-1 rounded-full transition ${
              gridMode === 'spaced'
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Generous
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-20">
        {/* Masonry Grid */}
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
              <div className={`columns-2 sm:columns-3 md:columns-4 lg:columns-5 ${gapClass}`}>
                {draft.content.map(item => (
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

      {/* Floating bottom bar */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4">
        {/* Add tile button - center */}
        <div className="relative">
          <input
            type="text"
            placeholder="Paste URL..."
            value={pasteUrl}
            onChange={e => setPasteUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddContent()}
            className="w-80 px-6 py-4 pr-14 bg-black/50 backdrop-blur-xl border border-white/20 rounded-full font-mono text-sm focus:border-white/40 focus:outline-none text-white placeholder:text-white/30"
            style={{ backdropFilter: 'blur(20px)' }}
          />
          <button
            onClick={handleAddContent}
            disabled={isAdding || !pasteUrl.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 transition flex items-center justify-center text-2xl"
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}
