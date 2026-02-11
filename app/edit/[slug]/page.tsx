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
import Image from 'next/image'
import { createBrowserSupabaseClient } from '@/lib/supabase'

interface TileContent extends DraftContent {
  source?: 'library' | 'links'
}

// ═══════════════════════════════════════════
// Sortable Tile
// ═══════════════════════════════════════════
function SortableTile({
  id, content, onDelete, onSelect, onDoubleClick, deleting, selected, size,
}: {
  id: string
  content: any
  onDelete: () => void
  onSelect: () => void
  onDoubleClick: () => void
  deleting: boolean
  selected: boolean
  size: number
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
    willChange: isDragging ? 'transform' : undefined,
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

  const sizeClass = size === 2 ? 'col-span-2 row-span-2' : 'aspect-square'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={sizeClass}
      data-tile
      {...attributes}
      {...listeners}
      onClick={onSelect}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick() }}
    >
      <div className={`relative rounded-xl overflow-hidden w-full h-full ${selected ? 'ring-2 ring-green-400' : ''}`}>
        {/* Red dot delete */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute top-0 left-0 w-11 h-11 z-10 flex items-center justify-center"
          title="Delete"
        >
          <span className="w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 transition-all" />
        </button>

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
                className="absolute inset-0 w-full h-full object-cover cursor-pointer"
                autoPlay
                muted
                loop
                playsInline
                onClick={handleVideoClick}
              />
              {!isMuted && (
                <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60 z-10" />
              )}
            </>
          ) : content.url?.startsWith('data:') ? (
            <img src={content.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <Image
              src={content.url}
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
  // Selection state
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  // Upload progress
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)

  // Bottom pill input state
  const [pillMode, setPillMode] = useState<'idle' | 'url' | 'thought'>('idle')
  const [pasteUrl, setPasteUrl] = useState('')
  const [thoughtText, setThoughtText] = useState('')
  const urlInputRef = useRef<HTMLInputElement>(null)
  const thoughtInputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
              room_id: tile.room_id || null,
              size: tile.size || 1,
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

  // ── File upload ──

  const VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/mov']

  // XHR upload to Supabase Storage with progress events
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

  // Extract first frame from video as JPEG data URL
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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0 || !draft || !serialNumber) return
    setIsAdding(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const isVideo = VIDEO_MIME.includes(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name)
        const countLabel = files.length > 1 ? `${i + 1} of ${files.length}` : ''

        try {
          // Extract thumbnail for videos
          let thumbnailDataUrl: string | null = null
          if (isVideo) {
            try {
              thumbnailDataUrl = await getVideoThumbnail(file)
            } catch { /* silent — grid will show dark placeholder */ }
          }

          // Add temp tile to grid immediately
          const tempId = `temp-${Date.now()}-${i}`
          setDraft(prev => prev ? {
            ...prev,
            content: [...prev.content, {
              id: tempId,
              url: thumbnailDataUrl || '',
              type: 'image',
              title: null,
              description: null,
              thumbnail_url: null,
              embed_html: null,
              position: prev.content.length,
              room_id: activeRoomId || null,
            }],
            updated_at: Date.now(),
          } : null)

          // Upload via XHR with real progress
          const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')
          const filename = `${serialNumber}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

          try {
            const publicUrl = await uploadWithProgress(file, filename, (pct) => {
              const suffix = countLabel ? ` (${countLabel})` : ''
              setUploadStatus(`Uploading... ${pct}%${suffix}`)
            })

            // Register DB record
            const res = await fetch('/api/upload/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug, url: publicUrl, room_id: activeRoomId }),
            })
            const data = await res.json()

            if (data.tile) {
              // Replace temp tile with real tile
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
                  room_id: data.tile.room_id || null,
                } : c),
                updated_at: Date.now(),
              } : null)
            }
          } catch (uploadErr) {
            // Remove temp tile on failure
            setDraft(prev => prev ? {
              ...prev,
              content: prev.content.filter(c => c.id !== tempId),
              updated_at: Date.now(),
            } : null)
            console.error(`Upload failed for ${file.name}:`, uploadErr)
            setUploadStatus(`Failed: ${(uploadErr as Error).message || file.name}`)
            await new Promise(r => setTimeout(r, 1500))
          }
        } catch (err) {
          console.error(`Upload failed for ${file.name}:`, err)
          setUploadStatus(`Failed: ${(err as Error).message || file.name}`)
          await new Promise(r => setTimeout(r, 1500))
        }
      }
    } finally {
      setIsAdding(false)
      setUploadStatus(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Selection helpers ──

  function handleSelect(id: string) {
    setSelectedTileId(prev => prev === id ? null : id)
    setPillMode('idle')
  }

  async function cycleSize(id: string) {
    if (!draft) return
    const tile = draft.content.find(c => c.id === id)
    if (!tile) return
    const source = tileSources[id]
    if (!source) return

    const currentSize = tile.size || 1
    const newSize = currentSize === 1 ? 2 : 1

    // Optimistic update
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
      // Revert on failure
      setDraft(prev => prev ? {
        ...prev,
        content: prev.content.map(c => c.id === id ? { ...c, size: currentSize } : c),
        updated_at: Date.now(),
      } : null)
    }
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

  const filteredContent = activeRoomId
    ? draft.content.filter(item => item.room_id === activeRoomId)
    : draft.content

  const theme = getTheme(draft.theme)

  return (
    <div className="min-h-screen pb-32 relative overflow-x-hidden max-w-[100vw]" style={{ background: theme.colors.background, color: theme.colors.text }}>
      {/* Wallpaper layer — real blur via filter */}
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
      {/* ═══ HEADER — two rows ═══ */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/60 backdrop-blur-sm border-b border-white/[0.06]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {/* Row 1: nav */}
        <div className="flex items-center justify-between px-4 h-11">
          <Link
            href={`/${slug}`}
            className="text-sm text-white/60 hover:text-white/90 transition font-mono"
          >
            ← view
          </Link>
          <Link
            href={`/${slug}`}
            className="text-sm font-medium text-white/90 hover:text-white transition px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20"
          >
            Done
          </Link>
        </div>
        {/* Row 2: room pills (scrollable) */}
        <div className="flex items-center gap-2 px-4 pb-2 overflow-x-auto hide-scrollbar">
          {rooms.filter(r => r.name && r.name.length > 1).map((room) => (
            <button
              key={room.id}
              onClick={() => setActiveRoomId(room.id)}
              className={`text-xs px-3 py-1 rounded-full transition-all whitespace-nowrap border-0 ${
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

      {/* ═══ DENSE MASONRY GRID ═══ */}
      <div className="max-w-7xl mx-auto px-3 md:px-6 pt-24 md:pt-20 pb-32 relative z-10">

        {filteredContent.length > 0 ? (
          <DndContext
            sensors={sensors}
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
                    onDelete={() => handleDelete(item.id)}
                    onSelect={() => handleSelect(item.id)}
                    onDoubleClick={() => cycleSize(item.id)}
                    deleting={deletingIds.has(item.id)}
                    selected={selectedTileId === item.id}
                    size={item.size || 1}
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

      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Upload status pill */}
      {uploadStatus && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-black/90 backdrop-blur-sm text-white/70 text-xs px-4 py-2 rounded-full border border-white/10 font-mono">
          {uploadStatus}
        </div>
      )}

      {/* ═══ BOTTOM BAR ═══ */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 pb-[env(safe-area-inset-bottom)]">

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
            {rooms.length > 0 && (
              <>
                <select
                  value={draft?.content.find(c => c.id === selectedTileId)?.room_id || ''}
                  onChange={async (e) => {
                    const newRoomId = e.target.value || null
                    const source = tileSources[selectedTileId!]
                    if (!source) return
                    try {
                      const supabase = createBrowserSupabaseClient()
                      await supabase.from(source).update({ room_id: newRoomId }).eq('id', selectedTileId)
                      setDraft(prev => prev ? {
                        ...prev,
                        content: prev.content.map(c =>
                          c.id === selectedTileId ? { ...c, room_id: newRoomId } : c
                        ),
                        updated_at: Date.now(),
                      } : null)
                    } catch (err) {
                      console.error('Failed to assign room:', err)
                    }
                  }}
                  className="bg-white/10 text-white text-xs font-mono rounded-lg px-2 py-1 border border-white/20 outline-none"
                >
                  <option value="">No room</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <div className="w-px h-4 bg-white/20" />
              </>
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
          /* DEFAULT PILL: camera | + | chat */
          <div className="flex items-center gap-0 bg-black/50 backdrop-blur-sm rounded-full border border-white/20 overflow-hidden">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-14 h-14 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
              title="Upload file"
            >
              <span className="text-white/60 text-sm font-bold">↑</span>
            </button>
            <div className="w-px h-6 bg-white/10" />
            <button
              onClick={() => setPillMode(pillMode === 'url' ? 'idle' : 'url')}
              className={`w-14 h-14 flex items-center justify-center transition-all ${
                pillMode === 'url' ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
              title="Add content"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </button>
            <div className="w-px h-6 bg-white/10" />
            <button
              onClick={() => setPillMode(pillMode === 'thought' ? 'idle' : 'thought')}
              className={`w-14 h-14 flex items-center justify-center transition-all ${
                pillMode === 'thought' ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
              title="Add thought"
            >
              <span className="text-white/60 text-sm font-medium">Aa</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
