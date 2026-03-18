'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { motion, LayoutGroup } from 'framer-motion'
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { loadDraft, saveDraft, clearDraft, DraftFootprint, DraftContent } from '@/lib/draft-store'
import ContentCard from '@/components/ContentCard'
import { audioManager } from '@/lib/audio-manager'
import { getTheme } from '@/lib/themes'
import { snapToPreset } from '@/lib/aspect-ratios'
import Image from 'next/image'
import ErrorBoundary from '@/components/ErrorBoundary'
import LayoutToggle from '@/components/LayoutToggle'
import { type RoomLayout } from '@/lib/grid-layouts'
import { type LayoutMode, getLayoutConfig } from '@/lib/layout-engine'
import {
  resolveAspect as resolveAspectShared,
  isVideoTile as isVideoTileShared,
  getGridClass as getGridClassShared,
  getAspectClass as getAspectClassShared,
  getObjectFit as getObjectFitShared,
} from '@/lib/media/aspect'
import {
  VIDEO_MIME as VIDEO_MIME_SHARED,
  isVideoFile,
  isHEIC,
  uploadWithProgress as uploadWithProgressShared,
  getVideoThumbnail as getVideoThumbnailShared,
  resizeImage as resizeImageShared,
  detectImageAspect as detectImageAspectShared,
  detectVideoAspect as detectVideoAspectShared,
} from '@/lib/upload'

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
// ═══════════════════════════════════════════
// Grid class helpers — size × aspect → col-span, row-span, aspect-ratio
// ═══════════════════════════════════════════

// Aspect / grid helpers — imported from @/lib/media/aspect
const resolveAspect = resolveAspectShared
const isVideoTileFn = isVideoTileShared
const getGridClass = getGridClassShared
const getAspectClass = getAspectClassShared
const getObjectFit = getObjectFitShared

function SortableTile({
  id, content, deleting, size, aspect, isArranging, isViewing, isMobile, selected, anyDragging, onTap,
  onLongPressStart, onLongPressMove, onLongPressEnd, onPinchResize,
}: {
  id: string
  content: any
  deleting: boolean
  size: number
  aspect: string
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
    isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    // During drag, apply dnd-kit transform directly for immediate feedback
    ...(isDragging && transform ? {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      zIndex: 50,
      scale: '1.05',
      boxShadow: '0 12px 32px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)',
      willChange: 'transform',
    } : {}),
    opacity: isDragging ? 1 : deleting ? 0.5 : anyDragging ? 0.9 : 1,
  }

  const isVideo = content.type === 'video' || (content.type === 'image' && /\.(mp4|mov|webm|m4v)($|\?)/i.test(content.url || ''))

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

  // Grid class based on size × aspect — determines col/row spanning and aspect ratio
  // Video dominance: videos always get col-span-2 row-span-2
  const gridClass = getGridClass(size, aspect, isVideo)
  const aspectClass = getAspectClass(isVideo ? 'wide' : aspect)
  const sizeClass = `${gridClass} ${aspectClass}`.trim()

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
    <motion.div
      ref={composedRef}
      layout
      layoutId={`editor-tile-${id}`}
      transition={{ type: 'spring', stiffness: 400, damping: 26, mass: 0.6 }}
      style={style}
      className={sizeClass}
      data-tile
    >
      <div
        className={`tile-inner relative fp-tile overflow-hidden w-full ${aspect !== 'auto' ? 'h-full' : isVideo ? 'aspect-video' : ''} ${
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
        {/* Upload progress overlay */}
        {isTemp && !(content as any)._failed && progress < 100 && (
          <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none">
            <div className="h-1 bg-white/10 rounded-full mx-1 mb-1">
              <div className="h-full bg-white/60 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
            </div>
            <div className="absolute bottom-2 right-2 text-[10px] text-white/50 font-mono tabular-nums">
              {progress}%
            </div>
          </div>
        )}
        {/* Upload failed overlay */}
        {(content as any)._failed && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 gap-1">
            <span className="text-xs text-red-400/90 font-mono">failed</span>
            <span className="text-[10px] text-white/30 font-mono">tap to retry</span>
          </div>
        )}
        {/* Tile content — absolute fill, object-fit based on aspect */}
        {(content.type === 'image' || content.type === 'video') ? (
          isVideo ? (
            <>
              {content.url ? (
                <video
                  ref={videoRef}
                  src={content.url}
                  className={`absolute inset-0 w-full h-full object-cover cursor-pointer ${isArranging ? 'pointer-events-none' : ''}`}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  onClick={handleVideoClick}
                  onLoadedData={() => setIsLoaded(true)}
                  onError={() => setIsLoaded(true)}
                />
              ) : null}
              {(!isLoaded || !content.url) && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="text-white/25 text-3xl">▶</div>
                </div>
              )}
              {!isMuted && (
                <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60 z-10" />
              )}
            </>
          ) : content.url?.startsWith('data:') ? (
            <img src={content.url} alt="" className={`${aspect === 'auto' ? 'w-full h-auto' : 'absolute inset-0 w-full h-full'} ${getObjectFit(aspect)}`} />
          ) : content.url ? (
            <Image
              src={content.url} unoptimized={content.url?.startsWith('data:')}
              alt=""
              width={400}
              height={400}
              sizes="(max-width: 640px) 50vw, 25vw"
              className={`${aspect === 'auto' ? 'w-full h-auto' : 'absolute inset-0 w-full h-full'} ${getObjectFit(aspect)}`}
              loading="lazy"
              decoding="async"
              quality={75}
              onError={(e) => {
                const img = e.target as HTMLImageElement
                img.style.opacity = '0'
                const parent = img.parentElement
                if (parent && !parent.querySelector('.tile-fallback')) {
                  const fallback = document.createElement('div')
                  fallback.className = 'tile-fallback absolute inset-0 flex items-center justify-center'
                  fallback.style.background = 'rgba(255,255,255,0.06)'
                  fallback.innerHTML = '<span style="color:rgba(255,255,255,0.2);font-size:1.5rem">⊞</span>'
                  parent.appendChild(fallback)
                }
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="text-white/20 text-2xl">⊞</div>
            </div>
          )
        ) : (
          <div className={`${aspect === 'auto' ? 'w-full min-h-[80px]' : 'absolute inset-0'} flex flex-col items-center justify-center bg-white/[0.05] p-2`}>
            {content.thumbnail_url ? (
              <Image src={content.thumbnail_url} alt="" width={200} height={200} sizes="(max-width: 640px) 50vw, 25vw" className={`${aspect === 'auto' ? 'w-full h-auto' : 'absolute inset-0 w-full h-full'} ${getObjectFit(aspect)}`} loading="lazy" decoding="async" quality={75}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            ) : (
              content.type === 'thought' ? (
                <p className={`text-white text-center line-clamp-4 px-2 ${
                  (content.title || '').length <= 6 ? 'text-lg font-bold tracking-[-0.03em]'
                  : (content.title || '').length <= 20 ? 'text-sm font-semibold tracking-[-0.02em]'
                  : 'text-xs font-medium leading-relaxed'
                }`}>
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
    </motion.div>
  )
}

// ═══════════════════════════════════════════
// EDIT PAGE
// ═══════════════════════════════════════════
export default function EditPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const [editingThought, setEditingThought] = useState<string | null>(null)
  const [editingThoughtText, setEditingThoughtText] = useState('')
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [tileSources, setTileSources] = useState<Record<string, 'library' | 'links'>>({})
  const [rooms, setRooms] = useState<any[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [gridFade, setGridFade] = useState<'visible' | 'out' | 'in'>('visible')
  const [wallpaperUrl, setWallpaperUrl] = useState('')
  const [backgroundBlur, setBackgroundBlur] = useState(true)
  const publicLayout = 'home' as const
  const [serialNumber, setSerialNumber] = useState<number | null>(null)
  const [isPublished, setIsPublished] = useState(false)
  const layoutMode: LayoutMode = 'grid'
  const [statusToast, setStatusToast] = useState<string | null>(null)
  const [pasteUrl, setPasteUrl] = useState('')
  const [thoughtText, setThoughtText] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  // Go Live state
  const [showGoLive, setShowGoLive] = useState(false)
  const [nextSerial, setNextSerial] = useState<number | null>(null)
  const [goLiveLoading, setGoLiveLoading] = useState(false)
  const [birthMoment, setBirthMoment] = useState<{ serial: number; slug: string } | null>(null)
  const [birthCountUp, setBirthCountUp] = useState(0)
  const [birthPhase, setBirthPhase] = useState<'counting' | 'reveal' | 'done'>('counting')

  // Finalize after Stripe payment redirect
  const finalizeCalledRef = useRef(false)
  const stripeSessionId = searchParams.get('session_id')
  const stripeUsername = searchParams.get('username')

  useEffect(() => {
    if (!stripeSessionId || !stripeUsername) return
    if (finalizeCalledRef.current) return
    finalizeCalledRef.current = true

    async function finalize() {
      try {
        const res = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'finalize',
            session_id: stripeSessionId,
            username: stripeUsername,
          }),
        })

        const data = await res.json()
        if (!res.ok || !data.success) {
          const msg = data.error || 'publish failed'
          setStatusToast(msg)
          setTimeout(() => setStatusToast(null), 5000)
          // Clean URL params
          const url = new URL(window.location.href)
          url.searchParams.delete('session_id')
          url.searchParams.delete('username')
          window.history.replaceState({}, '', url.toString())
          return
        }
        if (data.success) {
          // Start birth moment animation
          const targetSerial = data.serial
          setBirthMoment({ serial: targetSerial, slug: data.slug })
          setIsPublished(true)
          setSerialNumber(targetSerial)

          // Count-up animation with tick sound
          const start = Math.max(targetSerial - 20, 1)
          let current = start

          // Create tick sound using AudioContext (no external files)
          let audioCtx: AudioContext | null = null
          try { audioCtx = new AudioContext() } catch {}
          const tick = () => {
            if (!audioCtx) return
            const osc = audioCtx.createOscillator()
            const gain = audioCtx.createGain()
            osc.connect(gain)
            gain.connect(audioCtx.destination)
            osc.frequency.value = 800 + Math.random() * 200
            osc.type = 'sine'
            gain.gain.setValueAtTime(0.03, audioCtx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04)
            osc.start()
            osc.stop(audioCtx.currentTime + 0.04)
          }

          const countInterval = setInterval(() => {
            current += 1
            setBirthCountUp(current)
            tick()
            if (current >= targetSerial) {
              clearInterval(countInterval)
              // Final lock-in: slightly louder + lower tone
              if (audioCtx) {
                const osc = audioCtx.createOscillator()
                const gain = audioCtx.createGain()
                osc.connect(gain)
                gain.connect(audioCtx.destination)
                osc.frequency.value = 600
                osc.type = 'sine'
                gain.gain.setValueAtTime(0.06, audioCtx.currentTime)
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15)
                osc.start()
                osc.stop(audioCtx.currentTime + 0.15)
              }
              setTimeout(() => setBirthPhase('reveal'), 600)
            }
          }, 60)
          setBirthCountUp(start)

          // Clean URL params without reload
          const url = new URL(window.location.href)
          url.searchParams.delete('session_id')
          url.searchParams.delete('username')
          window.history.replaceState({}, '', url.toString())
        }
      } catch (err) {
        console.error('Finalize error:', err)
        setStatusToast('something went wrong — try refreshing')
        setTimeout(() => setStatusToast(null), 5000)
      }
    }

    finalize()
  }, [stripeSessionId, stripeUsername])

  const urlInputRef = useRef<HTMLInputElement>(null)
  const thoughtInputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingOpsRef = useRef<Set<Promise<any>>>(new Set())
  const longPressRef = useRef<NodeJS.Timeout | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  // Track a fire-and-forget save so we can flush before navigating
  const trackOp = useCallback((p: Promise<any>) => {
    pendingOpsRef.current.add(p)
    p.finally(() => pendingOpsRef.current.delete(p))
  }, [])

  // Flush debounced profile save + pending tile ops, then full-page navigate
  const navigateToPublic = useCallback(async () => {
    // Flush debounced profile save immediately
    if (saveTimeoutRef.current && draft && isOwner) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
      try {
        await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: draft.display_name,
            handle: draft.handle,
            bio: draft.bio,
            theme: draft.theme,
            grid_mode: draft.grid_mode,
          }),
        })
      } catch {}
    }
    // Wait for any in-flight tile saves (reorder, resize, etc.)
    if (pendingOpsRef.current.size > 0) {
      await Promise.allSettled(Array.from(pendingOpsRef.current))
    }
    // Full page load — bypasses Next.js Router Cache, guarantees fresh server render
    window.location.href = `/${slug}`
  }, [slug, draft, isOwner])

  // Mode transition helpers
  const enterEdit = () => setMode({ type: 'arranging' })
  const exitEdit = () => { setSwapSourceId(null); setMode({ type: 'viewing' }) }
  const openTileMenu = (tileId: string) => {
    setMode({ type: 'tile_menu', tileId })
  }
  const closeTileMenu = () => { setEditingThought(null); setMode({ type: 'arranging' }) }
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

  // Mobile detection (debounced)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const check = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => setIsMobile(window.innerWidth < 768), 150)
    }
    setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', check)
    return () => { window.removeEventListener('resize', check); clearTimeout(timeout) }
  }, [])

  // Flush pending saves on tab close / navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (saveTimeoutRef.current && draft && isOwner) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
        // keepalive fetch survives page unload
        fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: draft.display_name,
            handle: draft.handle,
            bio: draft.bio,
            theme: draft.theme,
          }),
          keepalive: true,
        }).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [draft, isOwner, slug])

  // Keyboard shortcuts — Escape to dismiss, step by step
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (mode.type === 'adding') { stopAdding(); setPasteUrl(''); setThoughtText('') }
      else if (mode.type === 'tile_menu') closeTileMenu()
      else if (mode.type === 'arranging') exitEdit()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode.type])

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
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 4 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 8 } })
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
          router.push(`/signin?redirect=${encodeURIComponent(`/${slug}/home`)}`)
          return
        }
        if (res.status === 401) {
          router.push(`/login?redirect=${encodeURIComponent(`/${slug}/home`)}`)
          return
        }
        if (res.status === 403) {
          // Logged in but wrong user
          router.push('/build')
          return
        }

        const data = await res.json()

        if (data.footprint) {
          setIsOwner(true)
          setWallpaperUrl(data.footprint.background_url || '')
          setBackgroundBlur(data.footprint.background_blur ?? true)
          setIsPublished(data.footprint.published !== false)
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
              aspect: tile.aspect || null,
              caption: tile.caption || null,
              render_mode: tile.render_mode || 'embed',
              artist: tile.artist || null,
              thumbnail_url_hq: tile.thumbnail_url_hq || null,
              media_id: tile.media_id || null,
            }
          })
          setTileSources(sources)

          setDraft({
            slug,
            display_name: data.footprint.display_name || '',
            handle: data.footprint.handle || '',
            bio: data.footprint.bio || '',
            theme: data.footprint.dimension || 'midnight',
            grid_mode: 'grid',
            avatar_url: data.footprint.avatar_url || null,
            content,
            updated_at: Date.now(),
          })

          setSerialNumber(data.footprint.serial_number || null)

          // Fetch rooms via server API (bypasses RLS) — only if serial exists
          if (data.footprint.serial_number) {
            const roomsRes = await fetch(`/api/rooms?serial_number=${data.footprint.serial_number}`)
            const roomsJson = await roomsRes.json()
            if (roomsJson.rooms?.length > 0) {
              setRooms(roomsJson.rooms)
              setActiveRoomId(roomsJson.rooms[0].id)
            }
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
            grid_mode: 'grid',
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

  // Toggle published/draft
  const togglePublished = useCallback(() => {
    const next = !isPublished
    setIsPublished(next)
    setStatusToast(next ? 'published' : 'draft')
    setTimeout(() => setStatusToast(null), 1500)
    const op = fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: next }),
    }).catch(e => console.error('Failed to toggle published:', e))
    trackOp(op)
  }, [isPublished, slug, trackOp])

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
            aspect: data.tile.aspect || null,
            render_mode: data.tile.render_mode || 'embed',
            artist: data.tile.artist || null,
            thumbnail_url_hq: data.tile.thumbnail_url_hq || null,
            media_id: data.tile.media_id || null,
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
            aspect: data.tile.aspect || null,
            render_mode: data.tile.render_mode || 'embed',
            artist: data.tile.artist || null,
            thumbnail_url_hq: data.tile.thumbnail_url_hq || null,
            media_id: data.tile.media_id || null,
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

    const op = fetch('/api/tiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, positions }),
    }).catch(e => console.error('Failed to save tile order:', e))
    trackOp(op)
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
    const op = fetch('/api/tiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, positions }),
    }).catch(e => console.error('Failed to save tile order:', e))
    trackOp(op)
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
        body: JSON.stringify({ serial_number: serialNumber, name: name.trim(), position: rooms.length, slug }),
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
        body: JSON.stringify({ id: roomId, name: name.trim(), slug }),
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
    // Optimistic update
    setDraft(prev => prev ? {
      ...prev,
      content: prev.content.map(c => c.room_id === roomId ? { ...c, room_id: null } : c),
    } : null)
    // Unassign via API (triggers revalidatePath on server)
    for (const tile of tilesInRoom) {
      const source = tileSources[tile.id]
      if (source) {
        const op = fetch('/api/tiles', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: tile.id, source, slug, room_id: null }),
        }).catch(e => console.error('Failed to clear tile room:', e))
        trackOp(op)
      }
    }
  }

  async function handleDeleteRoom(roomId: string) {
    if (!confirm('Delete this room? Tiles will be unassigned, not deleted.')) return
    try {
      const res = await fetch(`/api/rooms?id=${roomId}&slug=${encodeURIComponent(slug)}`, { method: 'DELETE' })
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

  async function handleToggleLayout(roomId: string, newLayout: RoomLayout) {
    // Optimistic update
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, layout: newLayout } : r))
    try {
      await fetch('/api/rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: roomId, layout: newLayout, slug }),
      })
    } catch (e) {
      console.error('Failed to toggle layout:', e)
    }
  }

  // ── Tile size ──

  async function setTileSize(id: string, newSize: number) {
    if (!draft) return
    const tile = draft.content.find(c => c.id === id)
    if (!tile) return
    const source = tileSources[id]
    if (!source) {
      console.warn('setTileSize: no source for tile', id, '— tileSources keys:', Object.keys(tileSources).length)
      return
    }

    const currentSize = tile.size || 1
    if (currentSize === newSize) return

    // Optimistic — apply immediately, don't roll back (server is best-effort)
    setDraft(prev => prev ? {
      ...prev,
      content: prev.content.map(c => c.id === id ? { ...c, size: newSize } : c),
      updated_at: Date.now(),
    } : null)

    const op = fetch('/api/tiles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, source, slug, size: newSize }),
    }).then(res => {
      if (!res.ok) res.text().then(body => console.error('Tile size PATCH failed:', res.status, body)).catch(() => {})
    }).catch(e => console.error('Tile size PATCH network error:', e))
    trackOp(op)
  }

  // ── Tile aspect ──

  async function setTileAspect(id: string, newAspect: string) {
    if (!draft) return
    const tile = draft.content.find(c => c.id === id)
    if (!tile) return
    const source = tileSources[id]
    if (!source) return

    const currentResolved = resolveAspect(tile.aspect, tile.type, tile.url)
    if (currentResolved === newAspect) return

    // Optimistic update
    setDraft(prev => prev ? {
      ...prev,
      content: prev.content.map(c => c.id === id ? { ...c, aspect: newAspect } : c),
      updated_at: Date.now(),
    } : null)

    try {
      const res = await fetch('/api/tiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, source, slug, aspect: newAspect }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error('Tile aspect PATCH failed:', res.status, body)
      }
    } catch (e) {
      console.error('Tile aspect PATCH network error:', e)
    }
  }

  // ── Room assign ──

  async function assignTileRoom(tileId: string, newRoomId: string | null) {
    const source = tileSources[tileId]
    if (!source) return
    // Optimistic update
    setDraft(prev => prev ? {
      ...prev,
      content: prev.content.map(c =>
        c.id === tileId ? { ...c, room_id: newRoomId } : c
      ),
      updated_at: Date.now(),
    } : null)
    const op = fetch('/api/tiles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tileId, source, slug, room_id: newRoomId }),
    }).catch(err => console.error('Failed to assign room:', err))
    trackOp(op)
  }

  // ── Edit thought text ──

  async function updateThoughtText(tileId: string, newText: string) {
    if (!draft) return
    const source = tileSources[tileId]
    if (!source) return

    setDraft(prev => prev ? {
      ...prev,
      content: prev.content.map(c =>
        c.id === tileId ? { ...c, title: newText } : c
      ),
      updated_at: Date.now(),
    } : null)

    const op = fetch('/api/tiles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tileId, source, slug, title: newText }),
    }).then(res => {
      if (!res.ok) res.text().then(body => console.error('Thought PATCH failed:', res.status, body)).catch(() => {})
    }).catch(e => console.error('Thought PATCH network error:', e))
    trackOp(op)
  }

  // ── File upload — utilities imported from @/lib/upload ──
  const VIDEO_MIME = VIDEO_MIME_SHARED
  const uploadWithProgress = uploadWithProgressShared
  const getVideoThumbnail = getVideoThumbnailShared
  const resizeImage = resizeImageShared
  const detectImageAspect = detectImageAspectShared
  const detectVideoAspect = detectVideoAspectShared

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const allFiles = Array.from(e.target.files || [])
    // Block video file uploads — only allow images
    const files = allFiles.filter(f =>
      !VIDEO_MIME.includes(f.type) && !/\.(mp4|mov|webm|m4v)$/i.test(f.name)
    )
    if (files.length === 0 || !draft || !serialNumber) return

    // 10MB limit for images
    const oversized = files.filter(f => f.size > 10 * 1024 * 1024)
    if (oversized.length > 0) {
      alert('under 10mb.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    // 8 uploaded-video cap (YouTube/Vimeo/embed tiles are free — only count direct uploads)
    const isUploadedVideo = (c: DraftContent) =>
      c.type === 'image' && c.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)
    const existingVideos = draft.content.filter(isUploadedVideo).length
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
        url: URL.createObjectURL(file) + (isVideo ? '#.mp4' : ''),
        type: (isVideo ? 'video' : 'image') as any,
        title: null,
        description: null,
        thumbnail_url: null,
        embed_html: null,
        position: (draft?.content.length || 0) + i,
        room_id: activeRoomId || null,
        aspect: null,
        _temp: true,
        _progress: 0,
      }
    })

    setDraft(prev => prev ? {
      ...prev,
      content: [...prev.content, ...tempTiles],
      updated_at: Date.now(),
    } : null)


    const uploadOne = async (file: File, idx: number) => {
      const isVideo = VIDEO_MIME.includes(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name)
      const tempId = tempIds[idx]

      try {
        // Detect aspect ratio before resize (preserves original ratio)
        let detectedAspect: string
        try {
          detectedAspect = isVideo ? await detectVideoAspect(file) : await detectImageAspect(file)
        } catch {
          detectedAspect = 'square'
        }

        let uploadFile: File
        if (!isVideo && (file.type === 'image/heic' || file.type === 'image/heif' || /\.heic$/i.test(file.name))) {
          try {
            uploadFile = await resizeImage(new File([file], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' }), 2400)
          } catch {
            uploadFile = file
          }
        } else if (!isVideo) {
          try {
            uploadFile = await resizeImage(file)
          } catch {
            uploadFile = file
          }
        } else {
          uploadFile = file
        }

        const ext = isVideo
          ? (file.name.split('.').pop() || 'mp4').toLowerCase()
          : 'jpg'
        const filename = `${serialNumber}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

        const contentType = isVideo
          ? (file.type === 'video/quicktime' ? 'video/mp4' : file.type || 'video/mp4')
          : (uploadFile.type || 'image/jpeg')

        const publicUrl = await uploadWithProgress(
          new File([uploadFile], uploadFile.name, { type: contentType }),
          filename,
          (pct) => {
            setDraft(prev => prev ? {
              ...prev,
              content: prev.content.map(c => c.id === tempId ? { ...c, _progress: pct } : c),
            } : null)
          }
        )

        const res = await fetch('/api/upload/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, url: publicUrl, room_id: activeRoomId, aspect: detectedAspect, content_type: contentType }),
        })
        if (!res.ok) throw new Error(`Register failed: ${res.status}`)
        const data = await res.json()

        if (data.tile) {
          // Non-fatal verification — log but never throw
          try {
            const headRes = await fetch(data.tile.url, { method: 'HEAD' })
            if (!headRes.ok) {
              console.warn('UPLOAD_VERIFY_SLOW', { tileId: data.tile.id, status: headRes.status })
            }
          } catch (verifyErr) {
            console.warn('UPLOAD_VERIFY_NETWORK', { tileId: data.tile.id, err: verifyErr })
          }

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
              aspect: data.tile.aspect || detectedAspect || (c as any).aspect || null,
              caption: (c as any).caption || null,
              render_mode: data.tile.render_mode || 'embed',
              artist: data.tile.artist || null,
              thumbnail_url_hq: data.tile.thumbnail_url_hq || null,
              media_id: data.tile.media_id || null,
            } : c),
            updated_at: Date.now(),
          } : null)
        }

        if (!isVideo) {
          const thumb = tempTiles[idx]?.url
          if (thumb?.startsWith('blob:')) URL.revokeObjectURL(thumb)
        }
      } catch (err: any) {
        // Mark tile as failed — tile persists with FAILED state, no ghost tiles
        setDraft(prev => prev ? {
          ...prev,
          content: prev.content.map(c => c.id === tempId ? { ...c, _failed: true, _progress: 0 } : c),
          updated_at: Date.now(),
        } : null)
        console.error('UPLOAD_FAIL', {
          name: file.name,
          size: file.size,
          type: file.type,
          message: err?.message || String(err),
          stack: err?.stack,
        })
        alert(`Upload failed: ${file.name}. Tap the tile to retry.`)
      }
    }

    const CONCURRENCY = 2
    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY)
      await Promise.allSettled(batch.map((file, batchIdx) => uploadOne(file, i + batchIdx)))
    }

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
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
          <span className="text-xs text-white/30 font-mono">loading</span>
        </div>
      </div>
    )
  }

  const filteredContent = activeRoomId
    ? draft.content.filter(item => item.room_id === activeRoomId)
    : draft.content

  const theme = getTheme(draft.theme)

  return (
    <ErrorBoundary context="editor">
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
          <div className="flex items-center gap-1">
            <button
              onClick={navigateToPublic}
              className="text-sm text-white/60 hover:text-white/90 transition font-mono flex items-center justify-center"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              ←
            </button>
            {!isArranging && (
              <button
                onClick={async () => {
                  await fetch('/api/auth/signout', { method: 'POST' })
                  window.location.href = '/login'
                }}
                className="text-[11px] text-white/25 hover:text-white/50 transition font-mono"
                style={{ minHeight: '44px', padding: '0 4px' }}
              >
                sign out
              </button>
            )}
          </div>
          {isArranging ? (
            <div className="flex items-center gap-2">
              {activeRoomId && (
                <>
                  <LayoutToggle
                    current={(rooms.find(r => r.id === activeRoomId)?.layout === 'editorial' ? 'editorial' : 'grid') as RoomLayout}
                    onToggle={(next) => handleToggleLayout(activeRoomId, next)}
                  />
                  <button
                    onClick={() => handleRenameRoom(activeRoomId)}
                    className="text-xs text-white/60 hover:text-white/90 transition font-mono px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.12]"
                    style={{ minHeight: '36px' }}
                  >
                    rename
                  </button>
                  <button
                    onClick={() => handleDeleteRoom(activeRoomId)}
                    className="text-xs text-red-400/80 hover:text-red-400 transition font-mono px-3 rounded-full bg-white/[0.06] hover:bg-red-500/[0.15]"
                    style={{ minHeight: '36px' }}
                  >
                    delete
                  </button>
                </>
              )}
              <button
                onClick={exitEdit}
                className="text-sm text-white/90 hover:text-white transition font-mono flex items-center justify-center px-5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20"
                style={{ minHeight: '36px', minWidth: '44px' }}
              >
                done
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {isPublished ? (
                <>
                  {/* Published/draft toggle — only for published rooms */}
                  <button
                    onClick={togglePublished}
                    className="flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition"
                    style={{ minHeight: '44px', minWidth: '44px' }}
                    title="Published — tap to set draft"
                  >
                    <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </>
              ) : (
                /* "go live ↗" button — only for unpublished rooms */
                <button
                  onClick={async () => {
                    // Already paid (has serial) — skip checkout, just publish + redirect
                    if (serialNumber) {
                      setGoLiveLoading(true)
                      try {
                        // Save current draft
                        if (draft) await saveData(draft)
                        // Publish
                        await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ published: true }),
                        })
                        // Redirect to public page
                        window.location.href = `/${encodeURIComponent(slug)}`
                        return
                      } catch {
                        setStatusToast('something went wrong')
                        setTimeout(() => setStatusToast(null), 3000)
                        setGoLiveLoading(false)
                        return
                      }
                    }
                    // No serial — first-time publish, show checkout modal
                    try {
                      const res = await fetch('/api/next-serial')
                      const data = await res.json()
                      setNextSerial(data.serial || null)
                    } catch {}
                    setShowGoLive(true)
                  }}
                  disabled={goLiveLoading}
                  className="text-[13px] text-white/60 hover:text-white/90 transition font-mono flex items-center justify-center px-5 rounded-full border border-white/[0.10] hover:border-white/25 disabled:opacity-30"
                  style={{
                    minHeight: '36px',
                    background: 'rgba(255, 255, 255, 0.04)',
                  }}
                >
                  {goLiveLoading ? '...' : 'go live'}
                </button>
              )}
              {/* Edit button */}
              <button
                onClick={enterEdit}
                className="text-sm text-white/90 hover:text-white transition font-mono flex items-center justify-center px-5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20"
                style={{ minHeight: '44px', minWidth: '44px' }}
              >
                edit
              </button>
            </div>
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
      <div className="max-w-7xl mx-auto px-3 md:px-6 pt-28 md:pt-24 pb-32 relative z-10"
        onClick={(e) => {
          // Tap background to deselect swap
          if (swapSourceId && (e.target as HTMLElement).closest('[data-tile]') === null) {
            setSwapSourceId(null)
          }
        }}
      >

        {filteredContent.length > 0 ? (
          <LayoutGroup>
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
              <motion.div
                key={publicLayout}
                layout
                transition={{ duration: 0.35, ease: 'easeInOut' }}
                className="grid grid-cols-2 md:grid-cols-4"
                style={{
                gap: `${getLayoutConfig(layoutMode).gap}px`,
                '--fp-tile-radius': `${getLayoutConfig(layoutMode).tileRadius}px`,
                gridAutoRows: publicLayout === 'home' ? 'auto' : undefined,
                gridAutoFlow: 'dense',
                opacity: gridFade === 'out' ? 0 : 1,
                transition: 'opacity 150ms ease-out, gap 350ms ease-out',
              } as React.CSSProperties}>
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
                    aspect={resolveAspect(item.aspect, item.type, item.url)}
                    onLongPressStart={(e: React.TouchEvent) => handleTouchStart(e, item.id)}
                    onLongPressMove={handleTouchMove}
                    onLongPressEnd={handleTouchEnd}
                    onPinchResize={(direction) => handlePinchResize(item.id, direction)}
                  />
                ))}
              </motion.div>
            </SortableContext>
          </DndContext>
          </LayoutGroup>
        ) : (
          <div className="text-center py-32 flex flex-col items-center gap-4">
            <p className="text-white/30 text-sm font-mono">
              {activeRoomId ? 'this room is empty.' : 'nothing here yet.'}
            </p>
            {isArranging ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-white/50 hover:text-white/80 font-mono px-5 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 transition-all"
              >
                add something
              </button>
            ) : (
              <button
                onClick={enterEdit}
                className="text-xs text-white/50 hover:text-white/80 font-mono px-5 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 transition-all"
              >
                tap to start
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
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
              {/* Tile preview */}
              <div className="flex items-center gap-3 pb-3 mb-1">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                  {selectedTile.type === 'image' && selectedTile.url && !selectedTile.url.match(/\.(mp4|mov|webm|m4v)($|\?)/i) ? (
                    <img src={selectedTile.url} alt="" className="w-full h-full object-cover" />
                  ) : selectedTile.thumbnail_url ? (
                    <img src={selectedTile.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">
                      {selectedTile.type === 'thought' ? 'Aa' : '?'}
                    </div>
                  )}
                </div>
                <p className="text-xs text-white/40 font-mono truncate">
                  {selectedTile.title || selectedTile.type || 'tile'}
                </p>
              </div>

              {/* Edit thought text */}
              {selectedTile.type === 'thought' && (
                editingThought === mode.tileId ? (
                  <div className="py-3 border-b border-white/[0.06]">
                    <textarea
                      autoFocus
                      value={editingThoughtText}
                      onChange={(e) => setEditingThoughtText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          const text = editingThoughtText.trim()
                          if (text) {
                            updateThoughtText(mode.tileId, text)
                          }
                          setEditingThought(null)
                        }
                      }}
                      className="w-full bg-white/[0.06] text-white text-sm rounded-lg px-3 py-2.5 border border-white/10 outline-none resize-none font-mono placeholder:text-white/20"
                      rows={3}
                      maxLength={280}
                      placeholder="edit your thought..."
                    />
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-white/20 font-mono">{editingThoughtText.length}/280</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingThought(null)}
                          className="px-3 py-1 rounded-md text-xs font-mono text-white/40 hover:text-white/60 transition"
                        >
                          cancel
                        </button>
                        <button
                          onClick={() => {
                            const text = editingThoughtText.trim()
                            if (text) {
                              updateThoughtText(mode.tileId, text)
                            }
                            setEditingThought(null)
                          }}
                          className="px-3 py-1 rounded-md text-xs font-mono bg-white/[0.12] text-white/70 hover:bg-white/20 hover:text-white transition"
                        >
                          save
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingThought(mode.tileId)
                      setEditingThoughtText(selectedTile.title || '')
                    }}
                    className="w-full text-left text-sm text-white/50 hover:text-white/80 transition font-mono py-3 border-b border-white/[0.06] flex items-center gap-2"
                  >
                    <span className="text-white/30 text-xs">Aa</span> edit text
                  </button>
                )
              )}

              {/* Resize — segmented control */}
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-white/50 font-mono">size</span>
                <div className="flex gap-1 bg-white/[0.04] rounded-lg p-0.5">
                  {[1, 2, 3].map(s => (
                    <button
                      key={s}
                      onClick={() => setTileSize(mode.tileId, s)}
                      className={`w-10 py-1.5 rounded-md text-xs font-mono transition-all ${
                        (selectedTile.size || 1) === s
                          ? 'bg-white/20 text-white shadow-sm'
                          : 'text-white/40 hover:text-white/60'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset room to defaults */}
              {(() => {
                const roomTiles = activeRoomId
                  ? draft.content.filter(c => c.room_id === activeRoomId)
                  : draft.content
                const allDefault = roomTiles.every(t => {
                  const sz = t.size || 1
                  const asp = resolveAspect(t.aspect, t.type, t.url)
                  return sz === 1 && (asp === 'auto' || (!t.aspect && t.type === 'image'))
                })
                return (
                  <div className="flex items-center justify-between py-3 border-t border-white/[0.06]">
                    <span className="text-sm text-white/50 font-mono">reset room</span>
                    <button
                      onClick={() => {
                        for (const t of roomTiles) {
                          setTileSize(t.id, 1)
                          setTileAspect(t.id, 'auto')
                        }
                      }}
                      disabled={allDefault}
                      className={`px-4 py-1.5 rounded-md text-xs font-mono transition-all ${
                        allDefault
                          ? 'bg-white/[0.03] text-white/20 cursor-default'
                          : 'bg-white/[0.06] text-white/40 hover:bg-white/[0.12] hover:text-white/60'
                      }`}
                    >
                      defaults
                    </button>
                  </div>
                )
              })()}

              {/* Room assign */}
              {rooms.length > 0 && (
                <div className="flex items-center justify-between py-3 border-t border-white/[0.06]">
                  <span className="text-sm text-white/50 font-mono">room</span>
                  <select
                    value={selectedTile.room_id || ''}
                    onChange={(e) => assignTileRoom(mode.tileId, e.target.value || null)}
                    className="bg-white/[0.08] text-white text-xs font-mono rounded-lg px-3 py-2 border border-white/10 outline-none"
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
                  className="w-full text-left text-sm text-white/50 hover:text-white/80 transition font-mono py-3 border-t border-white/[0.06] flex items-center gap-2"
                >
                  <span className="text-white/30 text-xs">◐</span> set as wallpaper
                </button>
              )}

              {/* Delete — visually separated */}
              <button
                onClick={() => { handleDelete(mode.tileId); closeTileMenu() }}
                className="w-full text-left text-sm transition font-mono py-3 mt-2 border-t border-white/[0.06] flex items-center"
                style={{ color: 'rgba(239, 68, 68, 0.7)' }}
              >
                delete
              </button>
            </div>
          </div>
        </>
      )}

      {/* Swap hint — shown when a tile is selected for swap on mobile */}
      {isMobile && isArranging && swapSourceId && mode.type !== 'tile_menu' && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-black/70 backdrop-blur-sm rounded-full border border-white/10 animate-overlay-fade">
          <span className="text-xs text-white/70 font-mono">tap another to swap</span>
        </div>
      )}

      {/* ═══ BOTTOM BAR — only in arranging/adding ═══ */}
      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 pb-[env(safe-area-inset-bottom)] transition-all duration-300 ${isArranging && mode.type !== 'tile_menu' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>

        {/* URL input */}
        {pillMode === 'url' && (
          <div className="w-80 bg-black/60 backdrop-blur-sm border border-white/20 rounded-2xl p-3 materialize">
            <input
              ref={urlInputRef}
              type="text"
              placeholder="paste a link"
              value={pasteUrl}
              onChange={e => setPasteUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddContent()
                if (e.key === 'Escape') stopAdding()
              }}
              onPaste={e => {
                const text = e.clipboardData.getData('text').trim()
                if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
                  e.preventDefault()
                  setPasteUrl(text)
                  setTimeout(() => handleAddContent(), 100)
                }
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
              placeholder="write something"
              value={thoughtText}
              onChange={e => setThoughtText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddThought()
                if (e.key === 'Escape') stopAdding()
              }}
              rows={3}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl font-mono text-sm focus:border-white/30 focus:outline-none text-white placeholder:text-white/30 resize-none"
            />
            <p className="text-[10px] text-white/20 font-mono mt-1 px-1">⌘+enter to save</p>
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

        {/* Default pill: upload | link | thought + wallpaper/layout controls */}
        {pillMode === 'idle' && (
          <div className="flex flex-col items-center gap-2">
            {wallpaperUrl && (
              <div className="flex items-center gap-0 bg-black/40 backdrop-blur-sm rounded-full border border-white/10 overflow-hidden px-1">
                <button
                  onClick={handleToggleBlur}
                  className={`text-[10px] font-mono px-3 py-1.5 rounded-full transition-all ${backgroundBlur ? 'text-white/80 bg-white/10' : 'text-white/40 hover:text-white/60'}`}
                >
                  blur
                </button>
                <button
                  onClick={handleClearWallpaper}
                  className="text-[10px] font-mono text-white/40 hover:text-red-400/80 px-3 py-1.5 rounded-full transition-all"
                >
                  clear bg
                </button>
              </div>
            )}
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
          </div>
        )}
      </div>

      {/* ═══ GO LIVE — full page takeover ═══ */}
      {showGoLive && !isPublished && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center birth-takeover">
          {/* Dismiss zone */}
          <div className="absolute inset-0" onClick={() => !goLiveLoading && setShowGoLive(false)} />

          <div className="relative z-10 text-center px-6" style={{ animation: 'birth-fade-up 0.6s ease-out' }}>
            {/* Serial preview — huge, faint */}
            {nextSerial && (
              <p className="font-mono text-white/[0.08] tracking-[0.3em] mb-10"
                style={{ fontSize: 'clamp(48px, 12vw, 80px)', fontWeight: 300 }}
              >
                {nextSerial.toString().padStart(4, '0')}
              </p>
            )}

            {/* URL */}
            <p className="font-mono text-white/30 text-[13px] tracking-[0.02em] mb-2">
              footprint.onl/{slug}/fp
            </p>

            {/* Price — quiet */}
            <p className="text-white/50 text-[13px] font-mono mb-12">
              $10
            </p>

            {/* CTA */}
            <button
              onClick={async () => {
                setGoLiveLoading(true)
                try {
                  const res = await fetch('/api/publish', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'publish-paid',
                      username: slug,
                    }),
                  })
                  const data = await res.json()
                  if (data.url) {
                    window.location.href = data.url
                  } else {
                    setStatusToast(data.error || 'something went wrong')
                    setTimeout(() => setStatusToast(null), 3000)
                    setGoLiveLoading(false)
                  }
                } catch {
                  setStatusToast('connection lost')
                  setTimeout(() => setStatusToast(null), 3000)
                  setGoLiveLoading(false)
                }
              }}
              disabled={goLiveLoading}
              className="px-8 py-3 rounded-full bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-all disabled:opacity-30"
            >
              {goLiveLoading ? '...' : 'go live'}
            </button>

            <div className="mt-6">
              <button
                onClick={() => setShowGoLive(false)}
                className="text-white/10 text-[11px] font-mono hover:text-white/25 transition-colors"
                disabled={goLiveLoading}
              >
                back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ BIRTH MOMENT — cinematic page takeover ═══ */}
      {birthMoment && (
        <div className="fixed inset-0 z-[200] birth-takeover">
          <div className="absolute inset-0 flex items-center justify-center">

            {/* Phase: counting — huge serial ticking up */}
            {birthPhase === 'counting' && (
              <p className="font-mono text-white/20 tracking-[0.3em] birth-counter"
                style={{ fontSize: 'clamp(56px, 15vw, 96px)', fontWeight: 300 }}
              >
                #{birthCountUp.toString().padStart(4, '0')}
              </p>
            )}

            {/* Phase: reveal — serial locks, details fade in */}
            {(birthPhase === 'reveal' || birthPhase === 'done') && (
              <div className="text-center px-6 w-full" style={{ animation: 'birth-fade-up 0.8s ease-out' }}>
                {/* Serial — huge, locks in */}
                <p className="font-mono text-white/30 tracking-[0.3em] mb-6"
                  style={{ fontSize: 'clamp(48px, 12vw, 80px)', fontWeight: 300 }}
                >
                  #{birthMoment.serial.toString().padStart(4, '0')}
                </p>

                {/* URL */}
                <p className="font-mono text-white/40 text-[13px] tracking-[0.02em] mb-16">
                  footprint.onl/{birthMoment.slug}
                </p>

                {/* Actions — minimal */}
                <button
                  onClick={() => {
                    window.location.href = `/${birthMoment.slug}`
                  }}
                  className="px-8 py-3 rounded-full bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-all"
                >
                  enter
                </button>

                <div className="mt-6">
                  <button
                    onClick={() => {
                      const url = `https://footprint.onl/${birthMoment.slug}/fp`
                      navigator.clipboard.writeText(url)
                      const el = document.getElementById('birth-copied')
                      if (el) { el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0' }, 1200) }
                    }}
                    className="text-white/15 text-[11px] font-mono hover:text-white/30 transition-colors"
                  >
                    copy link
                  </button>
                  <span id="birth-copied" className="ml-2 text-white/30 text-[11px] font-mono transition-opacity duration-300" style={{ opacity: 0 }}>
                    copied
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Upload indicator */}
      {isAdding && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[80] px-5 py-2 bg-black/70 backdrop-blur-sm rounded-full border border-white/10 flex items-center gap-2">
          <div className="w-3 h-3 border border-white/30 border-t-white/70 rounded-full animate-spin" />
          <span className="text-xs text-white/70 font-mono">uploading</span>
        </div>
      )}
      {/* Status toast */}
      {!isAdding && statusToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[80] px-5 py-2 bg-black/70 backdrop-blur-sm rounded-full border border-white/10 materialize">
          <span className="text-xs text-white/70 font-mono">{statusToast}</span>
        </div>
      )}
    </div>
    </ErrorBoundary>
  )
}

