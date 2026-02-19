'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { loadDraft, saveDraft, clearDraft, DraftFootprint, DraftContent } from '@/lib/draft-store'
import ContentCard from '@/components/ContentCard'
import { audioManager } from '@/lib/audio-manager'
import { getTheme } from '@/lib/themes'
import Link from 'next/link'
import Image from 'next/image'
import { createBrowserSupabaseClient } from '@/lib/supabase'

interface TileContent extends DraftContent {
  source?: 'library' | 'links'
}

// ═══════════════════════════════════════════
// Page Mode — single state machine, no competing booleans
// ═══════════════════════════════════════════
type PageMode =
  | { type: 'viewing' }
  | { type: 'arranging' }
  | { type: 'tile_menu'; tileId: string }
  | { type: 'adding'; method: 'idle' | 'url' | 'thought' }

// ═══════════════════════════════════════════
// Sortable Tile
// ═══════════════════════════════════════════
function SortableTile({
  id, content, deleting, size, isArranging, isViewing, isMobile, selected, anyDragging, onTap,
  onLongPressStart, onLongPressMove, onLongPressEnd, onPinchResize,
}: {
  id: string
  content: any
  deleting: boolean
  size: number
  isArranging: boolean
  isViewing: boolean
  isMobile: boolean
  selected: boolean
  anyDragging: boolean
  onTap: () => void
  onLongPressStart: (e: React.TouchEvent) => void
  onLongPressMove: (e: React.TouchEvent) => void
  onLongPressEnd: () => void
  onPinchResize: (direction: 'up' | 'down') => void
}) {
  const [isMuted, setIsMuted] = useState(true)
  const [isLoaded, setIsLoaded] = useState(false)
  const [videoVisible, setVideoVisible] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const tileRef = useRef<HTMLDivElement>(null)
  const audioIdRef = useRef(`edit-${id}`)
  const pinchRef = useRef<{ startDist: number; fired: boolean } | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    transition: {
      duration: 200,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging
      ? transition
      : `${transition || ''}, opacity 200ms ease-out, box-shadow 200ms ease-out`.replace(/^, /, ''),
    opacity: isDragging ? 1 : deleting ? 0.5 : anyDragging ? 0.9 : 1,
    scale: isDragging ? '1.05' : undefined,
    boxShadow: isDragging ? '0 12px 32px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)' : undefined,
    zIndex: isDragging ? 50 : undefined,
    willChange: isDragging ? 'transform' : undefined,
  }

  const isVideo = content.type === 'image' && content.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)

  // Video visibility — only play when on-screen, pause when off
  useEffect(() => {
    if (!isVideo) return
    const el = tileRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setVideoVisible(entry.isIntersecting),
      { rootMargin: '0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [isVideo])

  useEffect(() => {
    if (!isVideo || !videoRef.current) return
    if (videoVisible) {
      videoRef.current.play().catch(() => {})
    } else {
      videoRef.current.pause()
    }
  }, [videoVisible, isLoaded, isVideo])

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
    if (isArranging) return // let tile body onClick open bottom sheet
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

  const sizeClass = size === 3 ? 'col-span-2 row-span-2 md:col-span-3 md:row-span-3' : size === 2 ? 'col-span-2 row-span-2' : 'aspect-square'

  // Polaroid reveal — tile develops from frosted to crystal clear
  const isTemp = id.toString().startsWith('temp-')
  const progress = (content as any)?._progress ?? 0
  const revealStyle: React.CSSProperties | undefined = isTemp ? {
    filter: `blur(${Math.round((1 - progress / 100) * 8)}px)`,
    opacity: 0.4 + (progress / 100) * 0.6,
    transition: 'filter 0.4s ease-out, opacity 0.4s ease-out',
  } : undefined

  // dnd-kit handlers for arrange mode (pointer-based)
  const tileHandlers = isArranging
    ? { ...attributes, ...listeners, onClick: (e: React.MouseEvent) => { e.stopPropagation(); onTap() } }
    : {}

  // Touch: compose long-press (viewing) + pinch-to-resize (arranging)
  const touchHandlers = isMobile ? {
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        onLongPressEnd()
        if (isArranging) {
          const dx = e.touches[0].clientX - e.touches[1].clientX
          const dy = e.touches[0].clientY - e.touches[1].clientY
          pinchRef.current = { startDist: Math.sqrt(dx * dx + dy * dy), fired: false }
        }
      } else if (e.touches.length === 1 && (isViewing || isArranging)) {
        onLongPressStart(e)
      }
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault()
        if (!pinchRef.current.fired) {
          const dx = e.touches[0].clientX - e.touches[1].clientX
          const dy = e.touches[0].clientY - e.touches[1].clientY
          const dist = Math.sqrt(dx * dx + dy * dy)
          const delta = dist - pinchRef.current.startDist
          if (delta > 50) {
            pinchRef.current.fired = true
            onPinchResize('up')
          } else if (delta < -50) {
            pinchRef.current.fired = true
            onPinchResize('down')
          }
        }
      } else if (e.touches.length === 1 && (isViewing || isArranging)) {
        onLongPressMove(e)
      }
    },
    onTouchEnd: () => {
      pinchRef.current = null
      if (isViewing || isArranging) onLongPressEnd()
    },
  } : {}

  // Compose dnd-kit ref with our tile ref for IntersectionObserver
  const composedRef = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node)
    ;(tileRef as any).current = node
  }, [setNodeRef])

  return (
    <div
      ref={composedRef}
      style={style}
      className={sizeClass}
      data-tile
    >
      <div
        className={`tile-inner relative rounded-xl overflow-hidden w-full h-full ${
          isArranging
            ? isMobile
              ? 'tile-arranging ring-1 ring-white/20'
              : 'tile-arranging tile-jiggle'
            : ''
        } ${selected ? 'ring-2 ring-white/60' : ''}`}
        style={revealStyle}
        {...tileHandlers}
        {...touchHandlers}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Tile content — absolute fill to enforce square */}
        {content.type === 'image' ? (
          isVideo ? (
            <>
              <video
                ref={videoRef}
                src={content.url}
                className={`absolute inset-0 w-full h-full object-cover cursor-pointer transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                muted
                loop
                playsInline
                preload="none"
                onClick={handleVideoClick}
                onLoadedData={() => setIsLoaded(true)} onError={(e) => { setIsLoaded(true); (e.target as HTMLVideoElement).style.display = 'none' }}
              />
              {!isMuted && (
                <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60 z-10" />
              )}
            </>
          ) : content.url?.startsWith('data:') ? (
            <img src={content.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <Image
              src={content.url} unoptimized={content.url?.startsWith('data:')}
              alt=""
              width={400}
              height={400}
              sizes="(max-width: 640px) 50vw, 25vw"
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              quality={75}
              onError={(e) => { (e.target as HTMLElement).closest('[data-tile]')!.style.display = 'none' }}
            />
          )
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/[0.05] p-2">
            {content.thumbnail_url ? (
              <Image src={content.thumbnail_url} alt="" width={200} height={200} sizes="(max-width: 640px) 50vw, 25vw" className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" quality={75}
                onError={(e) => { (e.target as HTMLElement).closest('[data-tile]')!.style.display = 'none' }} />
            ) : (
              content.type === 'thought' ? (
                <p className="text-sm leading-relaxed text-white/80 text-center font-light tracking-wide line-clamp-4 px-2">
                  {content.title || ''}
                </p>
              ) : (
                <>
                  <div className="text-2xl mb-1 opacity-60">
                    {content.type === 'youtube' ? '▶' : content.type === 'spotify' ? '♫' : content.type === 'soundcloud' ? '♫' : content.type ? '🔗' : '?'}
                  </div>
                  <p className="text-[10px] text-white/50 text-center truncate w-full font-mono">
                    {content.title || content.type || '?'}
                  </p>
                </>
              )
            )}
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

  // Single state machine
  const [mode, setMode] = useState<PageMode>({ type: 'viewing' })
  const isArranging = mode.type !== 'viewing'
  const selectedTileId = mode.type === 'tile_menu' ? mode.tileId : null
  const pillMode = mode.type === 'adding' ? mode.method : 'idle'

  const [draft, setDraft] = useState<DraftFootprint | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [draggingTileId, setDraggingTileId] = useState<string | null>(null)
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [tileSources, setTileSources] = useState<Record<string, 'library' | 'links'>>({})
  const [rooms, setRooms] = useState<any[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [gridFade, setGridFade] = useState<'visible' | 'out' | 'in'>('visible')
  const [wallpaperUrl, setWallpaperUrl] = useState('')
  const [backgroundBlur, setBackgroundBlur] = useState(true)
  const [serialNumber, setSerialNumber] = useState<number | null>(null)
  const [pasteUrl, setPasteUrl] = useState('')
  const [thoughtText, setThoughtText] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const thoughtInputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const longPressRef = useRef<NodeJS.Timeout | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  // Mode transition helpers
  const enterEdit = () => setMode({ type: 'arranging' })
  const exitEdit = () => { setSwapSourceId(null); setMode({ type: 'viewing' }) }
  const openTileMenu = (tileId: string) => {
    setMode({ type: 'tile_menu', tileId })
  }
  const closeTileMenu = () => setMode({ type: 'arranging' })
  const startAdding = (method: 'url' | 'thought') => setMode({ type: 'adding', method })
  const stopAdding = () => setMode({ type: 'arranging' })

  // Switch rooms with crossfade
  const switchRoom = useCallback((roomId: string | null) => {
    if (roomId === activeRoomId || gridFade !== 'visible') return
    setGridFade('out')
    setTimeout(() => {
      setActiveRoomId(roomId)
      setGridFade('in')
      setTimeout(() => setGridFade('visible'), 250)
    }, 150)
  }, [activeRoomId, gridFade])

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Long-press: viewing → enter edit mode, arranging → open tile menu
  const handleTouchStart = useCallback((e: React.TouchEvent, tileId?: string) => {
    if (!isMobile) return
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }

    if (mode.type === 'viewing') {
      longPressRef.current = setTimeout(() => {
        enterEdit()
        longPressRef.current = null
        touchStartRef.current = null
      }, 500)
    } else if (isArranging && tileId) {
      longPressRef.current = setTimeout(() => {
        setSwapSourceId(null)
        openTileMenu(tileId)
        longPressRef.current = null
        touchStartRef.current = null
      }, 500)
    }
  }, [isMobile, mode.type, isArranging])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!longPressRef.current || !touchStartRef.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartRef.current.x
    const dy = touch.clientY - touchStartRef.current.y
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
      touchStartRef.current = null
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
    touchStartRef.current = null
  }, [])

  // Pinch-to-resize: spread/pinch cycles tile size
  const handlePinchResize = useCallback((tileId: string, direction: 'up' | 'down') => {
    if (!draft) return
    const tile = draft.content.find(c => c.id === tileId)
    if (!tile) return
    const current = tile.size || 1
    const next = direction === 'up'
      ? (current >= 3 ? 1 : current + 1)
      : (current <= 1 ? 3 : current - 1)
    setTileSize(tileId, next)
  }, [draft])

  // Desktop: click-and-drag. Mobile: tap-to-swap (no dnd-kit touch sensor).
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 8 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  const sensors = isMobile
    ? [mouseSensor, keyboardSensor]
    : [mouseSensor, touchSensor, keyboardSensor]

  // Load data
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
          cache: 'no-store',
          next: { revalidate: 0 },
        })

        // Auth/ownership failure → redirect to login or show error
        if (res.status === 401) {
          router.push(`/auth/login?redirect=${encodeURIComponent(`/${slug}/home`)}`)
          return
        }
        if (res.status === 403) {
          router.push('/dashboard')
          return
        }

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
              room_id: tile.room_id || null,
              size: tile.size || 1,
              caption: tile.caption || null,
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

          setSerialNumber(data.footprint.serial_number)

          // Fetch rooms via server API (bypasses RLS)
          const roomsRes = await fetch(`/api/rooms?serial_number=${data.footprint.serial_number}`)
          const roomsJson = await roomsRes.json()
          if (roomsJson.rooms?.length > 0) {
            setRooms(roomsJson.rooms)
            setActiveRoomId(roomsJson.rooms[0].id)
          }
        } else {
          // No footprint data but no error — empty state for owner
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
        // Network error — redirect to login as safest fallback
        router.push(`/auth/login?redirect=${encodeURIComponent(`/${slug}/home`)}`)
        return
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
        body: JSON.stringify({ slug, url: pasteUrl, room_id: activeRoomId }),
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
            room_id: data.tile.room_id || null,
            size: data.tile.size || 1,
          }],
          updated_at: Date.now(),
        } : null)
      }
      setPasteUrl('')
      stopAdding()
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
        body: JSON.stringify({ slug, thought: thoughtText, room_id: activeRoomId }),
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
            room_id: data.tile.room_id || null,
            size: data.tile.size || 1,
          }],
          updated_at: Date.now(),
        } : null)
      }
      setThoughtText('')
      stopAdding()
    } catch (e) {
      console.error('Failed to add thought:', e)
    } finally {
      setIsAdding(false)
    }
  }

  async function handleDelete(id: string) {
    if (deletingIds.has(id)) return
    setDeletingIds(prev => new Set(prev).add(id))
    if (selectedTileId === id) closeTileMenu()

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

  function handleDragStart(event: { active: { id: string | number } }) {
    setDraggingTileId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingTileId(null)
    const { active, over } = event
    if (!over || active.id === over.id || !draft) return

    const oldIndex = draft.content.findIndex(item => item.id === active.id)
    const newIndex = draft.content.findIndex(item => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const newContent = [...draft.content]
    const [moved] = newContent.splice(oldIndex, 1)
    newContent.splice(newIndex, 0, moved)

    const reordered = newContent.map((item, index) => ({ ...item, position: index }))

    setDraft({
      ...draft,
      content: reordered,
      updated_at: Date.now(),
    })

    // Persist positions to server
    const positions = reordered.map(item => ({
      id: item.id,
      source: tileSources[item.id] || 'library',
      position: item.position,
    }))

    fetch('/api/tiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, positions }),
    }).catch(e => console.error('Failed to save tile order:', e))
  }

  // ── Tap-to-swap (mobile only) ──

  function handleTileSwap(tileId: string) {
    if (!isMobile || !isArranging || !draft) return

    if (!swapSourceId) {
      setSwapSourceId(tileId)
      return
    }

    if (swapSourceId === tileId) {
      setSwapSourceId(null)
      return
    }

    const oldIndex = draft.content.findIndex(item => item.id === swapSourceId)
    const newIndex = draft.content.findIndex(item => item.id === tileId)
    if (oldIndex === -1 || newIndex === -1) { setSwapSourceId(null); return }

    const newContent = [...draft.content]
    ;[newContent[oldIndex], newContent[newIndex]] = [newContent[newIndex], newContent[oldIndex]]
    const reordered = newContent.map((item, index) => ({ ...item, position: index }))

    setDraft({ ...draft, content: reordered, updated_at: Date.now() })
    setSwapSourceId(null)

    const positions = reordered.map(item => ({
      id: item.id,
      source: tileSources[item.id] || 'library',
      position: item.position,
    }))
    fetch('/api/tiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, positions }),
    }).catch(e => console.error('Failed to save tile order:', e))
  }

  // ── Wallpaper from tile ──

  async function handleSetWallpaper(tileId: string) {
    if (!draft) return
    const tile = draft.content.find(c => c.id === tileId)
    if (!tile) return

    const imageUrl = tile.type === 'image' ? tile.url : tile.thumbnail_url
    if (!imageUrl) return

    try {
      const res = await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background_url: imageUrl }),
      })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      setWallpaperUrl(imageUrl)
      closeTileMenu()
    } catch (e) {
      console.error('Failed to set wallpaper:', e)
    }
  }

  async function handleClearWallpaper() {
    try {
      const res = await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background_url: '' }),
      })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      setWallpaperUrl('')
    } catch (e) {
      console.error('Failed to clear wallpaper:', e)
    }
  }

  async function handleToggleBlur() {
    const newBlur = !backgroundBlur
    try {
      const res = await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background_blur: newBlur }),
      })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      setBackgroundBlur(newBlur)
    } catch (e) {
      console.error('Failed to toggle blur:', e)
    }
  }

  // ── Room creation ──

  async function handleCreateRoom() {
    if (!draft || !serialNumber) return
    const name = prompt('Room name:')
    if (!name?.trim()) return
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial_number: serialNumber, name: name.trim(), position: rooms.length }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error || 'Failed to create room')
        return
      }
      if (json.room) setRooms(prev => [...prev, json.room])
    } catch (e) {
      console.error('Failed to create room:', e)
      alert('Failed to create room')
    }
  }

  async function handleRenameRoom(roomId: string) {
    const room = rooms.find(r => r.id === roomId)
    if (!room) return
    const name = prompt('Rename room:', room.name)
    if (!name?.trim() || name.trim() === room.name) return
    try {
      const res = await fetch('/api/rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: roomId, name: name.trim() }),
      })
      if (!res.ok) { alert('Failed to rename room'); return }
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, name: name.trim() } : r))
    } catch (e) {
      console.error('Failed to rename room:', e)
    }
  }

  async function handleClearRoom(roomId: string) {
    if (!draft) return
    const tilesInRoom = draft.content.filter(c => c.room_id === roomId)
    if (tilesInRoom.length === 0) return
    if (!confirm(`Remove ${tilesInRoom.length} tile${tilesInRoom.length > 1 ? 's' : ''} from this room? They won't be deleted.`)) return
    const sb = createBrowserSupabaseClient()
    for (const tile of tilesInRoom) {
      const source = tileSources[tile.id]
      if (source) {
        await sb.from(source).update({ room_id: null }).eq('id', tile.id)
      }
    }
    setDraft(prev => prev ? {
      ...prev,
      content: prev.content.map(c => c.room_id === roomId ? { ...c, room_id: null } : c),
    } : null)
  }

  async function handleDeleteRoom(roomId: string) {
    if (!confirm('Delete this room? Tiles will be unassigned, not deleted.')) return
    try {
      const res = await fetch(`/api/rooms?id=${roomId}`, { method: 'DELETE' })
      if (!res.ok) {
        alert('Failed to delete room')
        return
      }
      setRooms(prev => prev.filter(r => r.id !== roomId))
      if (draft) {
        setDraft(prev => prev ? {
          ...prev,
          content: prev.content.map(c => c.room_id === roomId ? { ...c, room_id: null } : c),
        } : null)
      }
      if (activeRoomId === roomId) setActiveRoomId(null)
    } catch (e) {
      console.error('Failed to delete room:', e)
    }
  }

  // ── Tile size ──

  async function setTileSize(id: string, newSize: number) {
    if (!draft) return
    const tile = draft.content.find(c => c.id === id)
    if (!tile) return
    const source = tileSources[id]
    if (!source) return

    const currentSize = tile.size || 1
    if (currentSize === newSize) return

    setDraft(prev => prev ? {
      ...prev,
      content: prev.content.map(c => c.id === id ? { ...c, size: newSize } : c),
      updated_at: Date.now(),
    } : null)

    try {
      const res = await fetch('/api/tiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, source, slug, size: newSize }),
      })
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`)
    } catch (e) {
      console.error('Failed to update tile size:', e)
      setDraft(prev => prev ? {
        ...prev,
        content: prev.content.map(c => c.id === id ? { ...c, size: currentSize } : c),
        updated_at: Date.now(),
      } : null)
    }
  }

  // ── Room assign ──

  async function assignTileRoom(tileId: string, newRoomId: string | null) {
    const source = tileSources[tileId]
    if (!source) return
    try {
      const supabase = createBrowserSupabaseClient()
      await supabase.from(source).update({ room_id: newRoomId }).eq('id', tileId)
      setDraft(prev => prev ? {
        ...prev,
        content: prev.content.map(c =>
          c.id === tileId ? { ...c, room_id: newRoomId } : c
        ),
        updated_at: Date.now(),
      } : null)
    } catch (err) {
      console.error('Failed to assign room:', err)
    }
  }

  // ── File upload ──

  const VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/mov']

  function uploadWithProgress(
    file: File,
    path: string,
    onProgress: (pct: number) => void
  ): Promise<string> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const url = `${supabaseUrl}/storage/v1/object/public/content/${path}`
          resolve(url)
        } else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`))
      }
      xhr.onerror = () => reject(new Error('Network error during upload'))

      xhr.open('POST', `${supabaseUrl}/storage/v1/object/content/${path}`)
      xhr.setRequestHeader('Authorization', `Bearer ${supabaseKey}`)
      xhr.setRequestHeader('apikey', supabaseKey)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.setRequestHeader('x-upsert', 'true')
      xhr.send(file)
    })
  }

  function getVideoThumbnail(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'metadata'
      video.src = URL.createObjectURL(file)
      const cleanup = () => URL.revokeObjectURL(video.src)
      video.onloadeddata = () => { video.currentTime = 1 }
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          canvas.getContext('2d')!.drawImage(video, 0, 0)
          cleanup()
          resolve(canvas.toDataURL('image/jpeg', 0.7))
        } catch (e) {
          cleanup()
          reject(e)
        }
      }
      video.onerror = () => { cleanup(); reject(new Error('Could not load video')) }
      setTimeout(() => { cleanup(); reject(new Error('Thumbnail timeout')) }, 10000)
    })
  }

  async function resizeImage(file: File, maxWidth = 1600): Promise<File> {
    if (file.size < 300 * 1024) return file

    return new Promise((resolve) => {
      const img = document.createElement('img')
      img.onload = () => {
        if (img.width <= maxWidth) {
          URL.revokeObjectURL(img.src)
          resolve(file)
          return
        }
        const scale = maxWidth / img.width
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(img.src)
        canvas.toBlob(blob => {
          resolve(new File([blob!],
            file.name.replace(/\.[^.]+$/, '.jpg'),
            { type: 'image/jpeg' }))
        }, 'image/jpeg', 0.82)
      }
      img.src = URL.createObjectURL(file)
    })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0 || !draft || !serialNumber) return

    // 50MB limit
    const oversized = files.filter(f => f.size > 50 * 1024 * 1024)
    if (oversized.length > 0) {
      alert('under 50mb.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    // 8 video cap
    const existingVideos = draft.content.filter(c =>
      c.type === 'image' && c.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)
    ).length
    const incomingVideos = files.filter(f =>
      VIDEO_MIME.includes(f.type) || /\.(mp4|mov|webm|m4v)$/i.test(f.name)
    ).length
    if (existingVideos + incomingVideos > 8) {
      alert('8 max.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setIsAdding(true)

    const tempIds = files.map((_, i) => `temp-${Date.now()}-${i}`)

    const tempTiles = files.map((file, i) => {
      const isVideo = VIDEO_MIME.includes(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name)
      return {
        id: tempIds[i],
        url: isVideo ? '' : URL.createObjectURL(file),
        type: 'image' as const,
        title: null,
        description: null,
        thumbnail_url: null,
        embed_html: null,
        position: (draft?.content.length || 0) + i,
        room_id: activeRoomId || null,
        _temp: true,
        _progress: 0,
      }
    })

    setDraft(prev => prev ? {
      ...prev,
      content: [...prev.content, ...tempTiles],
      updated_at: Date.now(),
    } : null)

    files.forEach((file, i) => {
      const isVideo = VIDEO_MIME.includes(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name)
      if (isVideo) {
        getVideoThumbnail(file).then(thumbUrl => {
          setDraft(prev => prev ? {
            ...prev,
            content: prev.content.map(c => c.id === tempIds[i] ? { ...c, url: thumbUrl } : c),
          } : null)
        }).catch(() => {})
      }
    })

    const uploadOne = async (file: File, idx: number) => {
      const isVideo = VIDEO_MIME.includes(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name)
      const tempId = tempIds[idx]

      try {
        const uploadFile = isVideo ? file : await resizeImage(file)
        const ext = uploadFile.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')
        const filename = `${serialNumber}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

        const publicUrl = await uploadWithProgress(uploadFile, filename, (pct) => {
          setDraft(prev => prev ? {
            ...prev,
            content: prev.content.map(c => c.id === tempId ? { ...c, _progress: pct } : c),
          } : null)
        })

        const res = await fetch('/api/upload/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, url: publicUrl, room_id: activeRoomId }),
        })
        if (!res.ok) throw new Error(`Register failed: ${res.status}`)
        const data = await res.json()

        if (data.tile) {
          setDraft(prev => prev ? {
            ...prev,
            content: prev.content.map(c => c.id === tempId ? { ...c, _progress: 100 } : c),
          } : null)

          await new Promise(r => setTimeout(r, 200))

          setTileSources(prev => ({ ...prev, [data.tile.id]: data.tile.source }))
          setDraft(prev => prev ? {
            ...prev,
            content: prev.content.map(c => c.id === tempId ? {
              id: data.tile.id,
              url: data.tile.url,
              type: data.tile.type,
              title: data.tile.title,
              description: data.tile.description,
              thumbnail_url: data.tile.thumbnail_url,
              embed_html: data.tile.embed_html,
              position: data.tile.position,
              room_id: data.tile.room_id || c.room_id || null,
              size: (c as any).size || 1,
              caption: (c as any).caption || null,
            } : c),
            updated_at: Date.now(),
          } : null)
        }

        if (!isVideo) {
          const thumb = tempTiles[idx]?.url
          if (thumb?.startsWith('blob:')) URL.revokeObjectURL(thumb)
        }
      } catch (err) {
        setDraft(prev => prev ? {
          ...prev,
          content: prev.content.filter(c => c.id !== tempId),
          updated_at: Date.now(),
        } : null)
        console.error(`Upload failed for ${file.name}:`, err)
      }
    }

    await Promise.allSettled(files.map((file, idx) => uploadOne(file, idx)))

    setIsAdding(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Derived values ──

  const selectedTile = selectedTileId ? draft?.content.find(c => c.id === selectedTileId) : null
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

  const filteredContent = activeRoomId
    ? draft.content.filter(item => item.room_id === activeRoomId)
    : draft.content

  const theme = getTheme(draft.theme)

  return (
    <div className="min-h-screen pb-32 relative overflow-x-hidden max-w-[100vw]" style={{ background: theme.colors.background, color: theme.colors.text }}>
      {/* Wallpaper layer */}
      {wallpaperUrl && (
        <div
          className="fixed inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${wallpaperUrl})`,
            filter: backgroundBlur ? 'blur(12px) brightness(0.7)' : 'none',
            transform: backgroundBlur ? 'scale(1.05)' : 'none',
          }}
        />
      )}

      {/* ═══ HEADER ═══ */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/60 backdrop-blur-sm border-b border-white/[0.06]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2" style={{ minHeight: '52px' }}>
          <Link
            href={`/${slug}`}
            className="text-sm text-white/60 hover:text-white/90 transition font-mono flex items-center justify-center"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            ←
          </Link>
          {isArranging && activeRoomId ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRenameRoom(activeRoomId)}
                className="text-xs text-white/60 hover:text-white/90 transition font-mono px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.12]"
                style={{ minHeight: '36px' }}
              >
                rename
              </button>
              <button
                onClick={() => handleClearRoom(activeRoomId)}
                className="text-xs text-white/60 hover:text-white/90 transition font-mono px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.12]"
                style={{ minHeight: '36px' }}
              >
                clear
              </button>
              <button
                onClick={() => handleDeleteRoom(activeRoomId)}
                className="text-xs text-red-400/80 hover:text-red-400 transition font-mono px-3 rounded-full bg-white/[0.06] hover:bg-red-500/[0.15]"
                style={{ minHeight: '36px' }}
              >
                delete
              </button>
            </div>
          ) : isArranging ? (
            <button
              onClick={exitEdit}
              className="text-sm text-white/90 hover:text-white transition font-mono flex items-center justify-center px-5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              done
            </button>
          ) : (
            <button
              onClick={enterEdit}
              className="text-sm text-white/90 hover:text-white transition font-mono flex items-center justify-center px-5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              edit
            </button>
          )}
        </div>
        {/* Room pills */}
        <div className="flex items-center gap-3 px-4 pb-3 overflow-x-auto hide-scrollbar">
          <button
            onClick={() => switchRoom(null)}
            className={`text-xs px-4 py-2 rounded-full transition-all duration-300 whitespace-nowrap backdrop-blur-sm border-0 ${
              activeRoomId === null
                ? 'bg-white/[0.12] text-white/90 scale-[1.05]'
                : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70 scale-100'
            }`}
            style={{ minHeight: '36px' }}
          >
            all
          </button>
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => switchRoom(room.id)}
              className={`text-xs px-4 py-2 rounded-full transition-all duration-300 whitespace-nowrap backdrop-blur-sm border-0 ${
                activeRoomId === room.id
                  ? 'bg-white/[0.12] text-white/90 scale-[1.05]'
                  : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70 scale-100'
              }`}
              style={{ minHeight: '36px' }}
            >
              {room.name}
            </button>
          ))}
          <button
            onClick={handleCreateRoom}
            className="text-xs px-4 py-2 rounded-full bg-white/[0.06] text-white/30 hover:text-white/60 hover:bg-white/[0.10] transition-all border-0"
            style={{ minHeight: '36px' }}
          >
            +
          </button>
        </div>
      </div>

      {/* ═══ TILE GRID ═══ */}
      <div className="max-w-7xl mx-auto px-3 md:px-6 pt-28 md:pt-24 pb-32 relative z-10">

        {filteredContent.length > 0 ? (
          <DndContext
            sensors={isArranging ? sensors : []}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredContent.map(item => item.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5" style={{
                gridAutoRows: 'minmax(180px, 1fr)',
                gridAutoFlow: 'dense',
                opacity: gridFade === 'out' ? 0 : 1,
                transition: 'opacity 150ms ease-out',
              }}>
                {filteredContent.map(item => (
                  <SortableTile
                    key={item.id}
                    id={item.id}
                    content={item}
                    isArranging={isArranging}
                    isViewing={mode.type === 'viewing'}
                    isMobile={isMobile}
                    selected={selectedTileId === item.id || swapSourceId === item.id}
                    anyDragging={draggingTileId !== null}
                    onTap={() => {
                      if (isMobile && isArranging) {
                        handleTileSwap(item.id)
                      } else {
                        openTileMenu(item.id)
                      }
                    }}
                    deleting={deletingIds.has(item.id)}
                    size={item.size || 1}
                    onLongPressStart={(e: React.TouchEvent) => handleTouchStart(e, item.id)}
                    onLongPressMove={handleTouchMove}
                    onLongPressEnd={handleTouchEnd}
                    onPinchResize={(direction) => handlePinchResize(item.id, direction)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="text-center py-32">
            <p className="text-white/30 text-sm font-mono">nothing here.</p>
          </div>
        )}
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

      {/* ═══ TILE ACTION SHEET ═══ */}
      {mode.type === 'tile_menu' && selectedTile && (
        <>
          {/* Scrim — tap to close */}
          <div className="fixed inset-0 z-[60] animate-overlay-fade" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={closeTileMenu} />
          {/* Sheet — swipe down to close */}
          <div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-[#111214] rounded-t-2xl border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)] animate-slide-up"
            style={{ maxHeight: '60vh' }}
            onTouchStart={(e) => {
              const el = e.currentTarget
              ;(el as any)._sheetTouchY = e.touches[0].clientY
            }}
            onTouchMove={(e) => {
              const el = e.currentTarget
              const startY = (el as any)._sheetTouchY
              if (startY === undefined) return
              const dy = e.touches[0].clientY - startY
              if (dy > 0) {
                el.style.transform = `translateY(${dy}px)`
                el.style.transition = 'none'
              }
            }}
            onTouchEnd={(e) => {
              const el = e.currentTarget
              const startY = (el as any)._sheetTouchY
              if (startY === undefined) return
              const dy = e.changedTouches[0].clientY - startY
              delete (el as any)._sheetTouchY
              if (dy > 80) {
                el.style.transition = 'transform 200ms ease-out'
                el.style.transform = 'translateY(100%)'
                setTimeout(closeTileMenu, 200)
              } else {
                el.style.transition = 'transform 200ms ease-out'
                el.style.transform = 'translateY(0)'
              }
            }}
          >
            {/* Drag indicator */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-4 pb-6 overflow-y-auto" style={{ maxHeight: 'calc(60vh - 28px)' }}>
              {/* Resize */}
              <div className="flex items-center justify-between" style={{ minHeight: '48px' }}>
                <span className="text-sm text-white/50 font-mono">size</span>
                <div className="flex gap-1.5">
                  {[1, 2, 3].map(s => (
                    <button
                      key={s}
                      onClick={() => setTileSize(mode.tileId, s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition ${
                        (selectedTile.size || 1) === s
                          ? 'bg-white/20 text-white'
                          : 'bg-white/[0.06] text-white/40 hover:bg-white/[0.10]'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Room assign */}
              {rooms.length > 0 && (
                <div className="flex items-center justify-between" style={{ minHeight: '48px' }}>
                  <span className="text-sm text-white/50 font-mono">room</span>
                  <select
                    value={selectedTile.room_id || ''}
                    onChange={(e) => assignTileRoom(mode.tileId, e.target.value || null)}
                    className="bg-white/10 text-white text-xs font-mono rounded-lg px-3 py-2 border border-white/20 outline-none"
                  >
                    <option value="">none</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Set as wallpaper */}
              {(selectedIsImage || selectedHasThumbnail) && (
                <button
                  onClick={() => handleSetWallpaper(mode.tileId)}
                  className="w-full text-left text-sm text-white/60 hover:text-white/90 transition font-mono border-t border-white/[0.06]"
                  style={{ minHeight: '48px', display: 'flex', alignItems: 'center' }}
                >
                  wallpaper
                </button>
              )}

              {/* Delete — separated, red text only */}
              <div className="mt-4">
                <button
                  onClick={() => { handleDelete(mode.tileId); closeTileMenu() }}
                  className="w-full text-left text-sm transition font-mono border-t border-white/[0.06]"
                  style={{ minHeight: '48px', display: 'flex', alignItems: 'center', color: '#ef4444' }}
                >
                  delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ BOTTOM BAR — only in arranging/adding ═══ */}
      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 pb-[env(safe-area-inset-bottom)] transition-all duration-300 ${isArranging && mode.type !== 'tile_menu' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>

        {/* URL input */}
        {pillMode === 'url' && (
          <div className="w-80 bg-black/60 backdrop-blur-sm border border-white/20 rounded-2xl p-3 materialize">
            <input
              ref={urlInputRef}
              type="text"
              placeholder=""
              value={pasteUrl}
              onChange={e => setPasteUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddContent()
                if (e.key === 'Escape') stopAdding()
              }}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl font-mono text-sm focus:border-white/30 focus:outline-none text-white placeholder:text-white/30"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAddContent}
                disabled={isAdding || !pasteUrl.trim()}
                className="flex-1 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl font-mono text-xs transition disabled:opacity-50"
              >
                {isAdding ? 'adding...' : 'add'}
              </button>
              <button
                onClick={() => { stopAdding(); setPasteUrl('') }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white/60 rounded-xl font-mono text-xs transition"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Thought input */}
        {pillMode === 'thought' && (
          <div className="w-80 bg-black/60 backdrop-blur-sm border border-white/20 rounded-2xl p-3 materialize">
            <textarea
              ref={thoughtInputRef}
              placeholder=""
              value={thoughtText}
              onChange={e => setThoughtText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && e.metaKey) handleAddThought()
                if (e.key === 'Escape') stopAdding()
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
                {isAdding ? 'adding...' : 'add'}
              </button>
              <button
                onClick={() => { stopAdding(); setThoughtText('') }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white/60 rounded-xl font-mono text-xs transition"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Default pill: upload | link | thought */}
        {pillMode === 'idle' && (
          <div className="flex items-center gap-0 bg-black/50 backdrop-blur-sm rounded-full border border-white/20 overflow-hidden">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-14 h-14 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
            >
              <span className="text-white/60 text-sm font-bold">↑</span>
            </button>
            <div className="w-px h-6 bg-white/10" />
            <button
              onClick={() => startAdding('url')}
              className="w-14 h-14 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </button>
            <div className="w-px h-6 bg-white/10" />
            <button
              onClick={() => startAdding('thought')}
              className="w-14 h-14 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
            >
              <span className="text-white/60 text-sm font-medium">Aa</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
