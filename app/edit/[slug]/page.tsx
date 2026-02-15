'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
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
// Sortable Tile — drag handle only, no long-press
// ═══════════════════════════════════════════
function SortableTile({
  id, content, deleting, size, isArranging, isViewing, isMobile, selected, onTap,
  onLongPressStart, onLongPressMove, onLongPressEnd,
}: {
  id: string
  content: any
  deleting: boolean
  size: number
  isArranging: boolean
  isViewing: boolean
  isMobile: boolean
  selected: boolean
  onTap: () => void
  onLongPressStart: (e: React.TouchEvent) => void
  onLongPressMove: (e: React.TouchEvent) => void
  onLongPressEnd: () => void
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

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : deleting ? 0.5 : 1,
    contain: 'layout style paint',
    willChange: isDragging ? 'transform' : 'auto',
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

  const sizeClass = size === 3 ? 'col-span-3 row-span-3' : size === 2 ? 'col-span-2 row-span-2' : 'aspect-square'

  // Polaroid reveal — tile develops from frosted to crystal clear
  const isTemp = id.toString().startsWith('temp-')
  const progress = (content as any)?._progress ?? 0
  const revealStyle: React.CSSProperties | undefined = isTemp ? {
    filter: `blur(${Math.round((1 - progress / 100) * 8)}px)`,
    opacity: 0.4 + (progress / 100) * 0.6,
    transition: 'filter 0.4s ease-out, opacity 0.4s ease-out',
  } : undefined

  // In arrange mode: dnd-kit listeners on tile body + onClick for bottom sheet
  // In viewing mode (mobile): long-press to enter arrange mode
  const tileHandlers = isArranging
    ? { ...attributes, ...listeners, onClick: (e: React.MouseEvent) => { e.stopPropagation(); onTap() } }
    : isViewing && isMobile
      ? { onTouchStart: onLongPressStart, onTouchMove: onLongPressMove, onTouchEnd: onLongPressEnd }
      : {}

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={sizeClass}
      data-tile
    >
      <div
        className={`tile-inner relative rounded-xl overflow-hidden w-full h-full ${isArranging ? 'tile-arranging tile-jiggle' : ''} ${selected ? 'ring-2 ring-white/60' : ''}`}
        style={revealStyle}
        {...tileHandlers}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Tile content — absolute fill to enforce square */}
        {content.type === 'image' ? (
          isVideo ? (
            <>
              <video
                ref={videoRef}
                src={content.url}
                className={`absolute inset-0 w-full h-full object-cover cursor-pointer transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                muted
                loop
                playsInline
                autoPlay
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
              src={content.url} unoptimized={content.url?.includes("/content/")}
              alt=""
              width={200}
              height={200}
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
              <>
                <div className="text-2xl mb-1 opacity-60">
                  {content.type === 'youtube' ? '▶' : content.type === 'spotify' ? '♫' : content.type === 'soundcloud' ? '♫' : content.type === 'thought' ? '💭' : content.type ? '🔗' : '?'}
                </div>
                <p className="text-[10px] text-white/50 text-center truncate w-full font-mono">
                  {content.title || content.type || '?'}
                </p>
              </>
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
  const [isOwner, setIsOwner] = useState(false)
  const [tileSources, setTileSources] = useState<Record<string, 'library' | 'links'>>({})
  const [rooms, setRooms] = useState<any[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
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
  const exitEdit = () => setMode({ type: 'viewing' })
  const openTileMenu = (tileId: string) => {
    setMode({ type: 'tile_menu', tileId })
  }
  const closeTileMenu = () => setMode({ type: 'arranging' })
  const startAdding = (method: 'url' | 'thought') => setMode({ type: 'adding', method })
  const stopAdding = () => setMode({ type: 'arranging' })

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Long-press to enter arrange mode (mobile + viewing only)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile || mode.type !== 'viewing') return
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    longPressRef.current = setTimeout(() => {
      enterEdit()
      longPressRef.current = null
      touchStartRef.current = null
    }, 500)
  }, [isMobile, mode.type])

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

  // Mouse: click-and-drag 8px. Touch: hold 200ms then drag. Both allow normal scroll/tap.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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

  async function handleSetWallpaper(tileId: string) {
    if (!draft) return
    const tile = draft.content.find(c => c.id === tileId)
    if (!tile) return

    const imageUrl = tile.type === 'image' ? tile.url : tile.thumbnail_url
    if (!imageUrl) return

    try {
      await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background_url: imageUrl }),
      })
      setWallpaperUrl(imageUrl)
      closeTileMenu()
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
      await fetch('/api/tiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, source, slug, size: newSize }),
      })
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

    // 4 video cap
    const existingVideos = draft.content.filter(c =>
      c.type === 'image' && c.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)
    ).length
    const incomingVideos = files.filter(f =>
      VIDEO_MIME.includes(f.type) || /\.(mp4|mov|webm|m4v)$/i.test(f.name)
    ).length
    if (existingVideos + incomingVideos > 4) {
      alert('4 max.')
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
        <div className="flex items-center justify-between px-4 h-11">
          <Link
            href={`/${slug}`}
            className="text-sm text-white/60 hover:text-white/90 transition font-mono"
          >
            ← view
          </Link>
          <div className="flex items-center gap-2">
            {isArranging && activeRoomId && (
              <>
                <button
                  onClick={() => setActiveRoomId(null)}
                  className="text-xs text-white/40 hover:text-white/70 transition font-mono"
                >
                  clear
                </button>
                <button
                  onClick={() => handleDeleteRoom(activeRoomId)}
                  className="text-xs text-red-400/60 hover:text-red-400 transition font-mono"
                >
                  delete
                </button>
              </>
            )}
            {isArranging ? (
              <button
                onClick={exitEdit}
                className="text-sm font-medium text-white/90 hover:text-white transition px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20"
              >
                done
              </button>
            ) : (
              <button
                onClick={enterEdit}
                className="text-sm font-medium text-white/90 hover:text-white transition px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20"
              >
                edit
              </button>
            )}
          </div>
        </div>
        {/* Room pills */}
        <div className="flex items-center gap-2 px-4 pb-2 overflow-x-auto hide-scrollbar">
          <button
            onClick={() => setActiveRoomId(null)}
            className={`text-xs px-3 py-1 rounded-full transition-all whitespace-nowrap backdrop-blur-sm border-0 ${
              activeRoomId === null
                ? 'bg-white/[0.12] text-white/90'
                : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70'
            }`}
          >
            all
          </button>
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setActiveRoomId(room.id)}
              className={`text-xs px-3 py-1 rounded-full transition-all whitespace-nowrap backdrop-blur-sm border-0 ${
                activeRoomId === room.id
                  ? 'bg-white/[0.12] text-white/90'
                  : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70'
              }`}
            >
              {room.name}
            </button>
          ))}
          <button
            onClick={handleCreateRoom}
            className="text-xs px-3 py-1 rounded-full bg-white/[0.06] text-white/30 hover:text-white/60 hover:bg-white/[0.10] transition-all border-0"
          >
            +
          </button>
        </div>
      </div>

      {/* ═══ TILE GRID ═══ */}
      <div className="max-w-7xl mx-auto px-3 md:px-6 pt-24 md:pt-20 pb-32 relative z-10">

        {filteredContent.length > 0 ? (
          <DndContext
            sensors={isArranging ? sensors : []}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredContent.map(item => item.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-1.5" style={{ gridAutoRows: 'minmax(180px, 1fr)', gridAutoFlow: 'dense' }}>
                {filteredContent.map(item => (
                  <SortableTile
                    key={item.id}
                    id={item.id}
                    content={item}
                    isArranging={isArranging}
                    isViewing={mode.type === 'viewing'}
                    isMobile={isMobile}
                    selected={selectedTileId === item.id}
                    onTap={() => openTileMenu(item.id)}
                    deleting={deletingIds.has(item.id)}
                    size={item.size || 1}
                    onLongPressStart={handleTouchStart}
                    onLongPressMove={handleTouchMove}
                    onLongPressEnd={handleTouchEnd}
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
          {/* Scrim */}
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={closeTileMenu} />
          {/* Sheet */}
          <div className="fixed bottom-0 left-0 right-0 z-[70] bg-[#111214] rounded-t-2xl border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)] animate-slide-up">
            {/* Drag indicator */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-5 pb-6 space-y-4">
              {/* Resize */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/50 font-mono">size</span>
                <div className="flex gap-1.5">
                  {[1, 2, 3].map(s => (
                    <button
                      key={s}
                      onClick={() => setTileSize(mode.tileId, s)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono transition ${
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
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50 font-mono">room</span>
                  <select
                    value={selectedTile.room_id || ''}
                    onChange={(e) => assignTileRoom(mode.tileId, e.target.value || null)}
                    className="bg-white/10 text-white text-xs font-mono rounded-lg px-3 py-1.5 border border-white/20 outline-none"
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
                  className="w-full text-left text-sm text-white/60 hover:text-white/90 transition font-mono py-2 border-t border-white/[0.06]"
                >
                  wallpaper
                </button>
              )}

              {/* Delete */}
              <button
                onClick={() => { handleDelete(mode.tileId); closeTileMenu() }}
                className="w-full text-left text-sm text-red-400/70 hover:text-red-400 transition font-mono py-2 border-t border-white/[0.06]"
              >
                delete
              </button>
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
