'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, DragOverlay, DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ContentCard from '@/components/ContentCard'
import VideoTile from '@/components/VideoTile'
import WeatherEffect from '@/components/WeatherEffect'
import { PlusButton } from '@/components/PlusButton'
import { RemoveBubble } from '@/components/RemoveBubble'
import { RolodexDrawer } from '@/components/RolodexDrawer'
import FloatingCtaBar from '@/components/FloatingCtaBar'

interface Room {
  id: string
  name: string
  content: any[]
}

interface PublicPageProps {
  footprint: any
  content: any[]
  rooms: Room[]
  theme: any
  serial: string
  pageUrl: string
  isDraft?: boolean
}

// Sortable wrapper for public page tiles
function SortableTile({ id, children, className, style }: { id: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const mergedStyle: React.CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    cursor: 'grab',
  }
  return (
    <div ref={setNodeRef} style={mergedStyle} className={className} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

const noop = () => {}

// Wallpaper filter per room - derived from room index
const ROOM_FILTERS = [
  'blur(8px) brightness(0.45) saturate(0.85) hue-rotate(-8deg)',
  'blur(4px) brightness(0.65) saturate(1.4) hue-rotate(25deg)',
  'blur(16px) brightness(0.3) saturate(1.6) hue-rotate(-35deg)',
  'blur(0px) brightness(0.55) saturate(0.2) hue-rotate(0deg)',
  'blur(10px) brightness(0.7) saturate(1.2) hue-rotate(35deg)',
  'blur(14px) brightness(0.35) saturate(0.4) hue-rotate(-20deg)',
]
const DEFAULT_FILTER = 'blur(12px)'

const ROOM_OVERLAYS = [
  'rgba(0,0,0,0.35)',
  'rgba(0,0,0,0.30)',
  'rgba(0,0,0,0.42)',
  'rgba(0,0,0,0.38)',
  'rgba(0,0,0,0.28)',
  'rgba(0,0,0,0.45)',
]
const DEFAULT_OVERLAY = 'rgba(0,0,0,0.35)'

// ═══════════════════════════════════════════
// EDITORIAL GRID ALGORITHM
// Deterministic row-based layout that composes
// tiles into hero/pair/breath/trio patterns
// ═══════════════════════════════════════════

type RowType = 'hero' | 'pair' | 'breath' | 'trio'
interface LayoutRow {
  type: RowType
  tiles: any[]
  // For pairs: split ratio
  splitRatio?: [number, number]
}

// Row type sequence — hero is rare, pairs and trios dominate
const ROW_SEQUENCE: RowType[] = ['hero', 'pair', 'trio', 'pair', 'breath', 'pair']

function buildEditorialRows(tiles: any[]): LayoutRow[] {
  if (tiles.length === 0) return []
  if (tiles.length === 1) return [{ type: 'hero', tiles: [tiles[0]] }]
  if (tiles.length === 2) return [
    { type: 'hero', tiles: [tiles[0]] },
    { type: 'hero', tiles: [tiles[1]] },
  ]

  const rows: LayoutRow[] = []
  let cursor = 0
  let seqIdx = 0

  while (cursor < tiles.length) {
    const remaining = tiles.length - cursor
    const rowType = ROW_SEQUENCE[seqIdx % ROW_SEQUENCE.length]

    // Text tile pairing: if next tile is a thought, try to pair it with an image
    const nextTile = tiles[cursor]
    const isTextTile = nextTile?.type === 'thought'

    if (isTextTile && remaining >= 2) {
      // Text tiles always pair with adjacent image/media tile
      rows.push({
        type: 'pair',
        tiles: [tiles[cursor], tiles[cursor + 1]],
        splitRatio: [40, 60],
      })
      cursor += 2
      seqIdx++
      continue
    }

    // Check if the NEXT tile after current is a thought — pair them
    if (remaining >= 2 && tiles[cursor + 1]?.type === 'thought') {
      rows.push({
        type: 'pair',
        tiles: [tiles[cursor], tiles[cursor + 1]],
        splitRatio: [60, 40],
      })
      cursor += 2
      seqIdx++
      continue
    }

    switch (rowType) {
      case 'hero':
        rows.push({ type: 'hero', tiles: [tiles[cursor]] })
        cursor += 1
        break
      case 'pair':
        if (remaining >= 2) {
          // Alternate split ratios for visual variety
          const ratioIdx = rows.filter(r => r.type === 'pair').length
          const ratio: [number, number] = ratioIdx % 2 === 0 ? [60, 40] : [50, 50]
          rows.push({ type: 'pair', tiles: [tiles[cursor], tiles[cursor + 1]], splitRatio: ratio })
          cursor += 2
        } else {
          rows.push({ type: 'hero', tiles: [tiles[cursor]] })
          cursor += 1
        }
        break
      case 'breath':
        rows.push({ type: 'breath', tiles: [tiles[cursor]] })
        cursor += 1
        break
      case 'trio':
        if (remaining >= 3) {
          rows.push({ type: 'trio', tiles: [tiles[cursor], tiles[cursor + 1], tiles[cursor + 2]] })
          cursor += 3
        } else if (remaining >= 2) {
          rows.push({ type: 'pair', tiles: [tiles[cursor], tiles[cursor + 1]], splitRatio: [50, 50] })
          cursor += 2
        } else {
          rows.push({ type: 'hero', tiles: [tiles[cursor]] })
          cursor += 1
        }
        break
    }
    seqIdx++
  }

  return rows
}

// ═══════════════════════════════════════════
// GRID LAYOUT (uniform)
// ═══════════════════════════════════════════
function buildGridRows(tiles: any[], isMobile: boolean): LayoutRow[] {
  const cols = isMobile ? 2 : 3
  const rows: LayoutRow[] = []
  for (let i = 0; i < tiles.length; i += cols) {
    const chunk = tiles.slice(i, i + cols)
    if (chunk.length === 3) {
      rows.push({ type: 'trio', tiles: chunk })
    } else if (chunk.length === 2) {
      rows.push({ type: 'pair', tiles: chunk, splitRatio: [50, 50] })
    } else {
      rows.push({ type: 'hero', tiles: chunk })
    }
  }
  return rows
}

// Smart default aspect
function resolveAspect(explicitAspect: string | undefined | null, type: string, url?: string): string {
  if (explicitAspect && explicitAspect !== 'square') return explicitAspect
  if (explicitAspect === 'square') return 'square'
  if (type === 'youtube' || type === 'vimeo') return 'wide'
  if (type === 'video') return 'auto'
  if (type === 'image' && url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)) return 'auto'
  if (type === 'image') return 'auto'
  return 'square'
}

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl, isDraft }: PublicPageProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [localOrder, setLocalOrder] = useState<Record<string, string[]>>({})
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const interactive = footprint.interactive !== false // default true
  const gm = footprint.grid_mode
  const layoutMode: string = (gm === 'editorial' || gm === 'breathe' || gm === 'grid') ? gm : 'editorial'

  // Sensors: desktop = click+drag (8px threshold), mobile = long-press (200ms)
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 8 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  const sensors = useSensors(mouseSensor, touchSensor)

  // Default to first room on mount
  useEffect(() => {
    if (activeRoomId === null && rooms.length > 0) {
      const visible = rooms.filter(r => r.name && r.name.trim().length > 0)
      if (visible.length > 0) setActiveRoomId(visible[0].id)
    }
  }, [rooms])
  const [wallpaperLoaded, setWallpaperLoaded] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [roomFade, setRoomFade] = useState<'visible' | 'out' | 'in'>('visible')

  // Memoize content filtering
  const validContent = useMemo(() =>
    allContent.filter(item =>
      (item.type === 'thought' && item.title) ||
      (item.url && item.url !== '')
    ), [allContent])

  const visibleRooms = useMemo(() =>
    rooms
      .filter(r => r.name && r.name.trim().length > 0)
      .map(r => ({
        ...r,
        content: r.content.filter((item: any) =>
          (item.type === 'thought' && item.title) ||
          (item.url && item.url !== '')
        )
      })), [rooms])

  const baseContent = activeRoomId
    ? visibleRooms.find(r => r.id === activeRoomId)?.content || []
    : validContent

  // Apply local drag order if user has rearranged tiles in this room
  const orderKey = activeRoomId || '__all__'
  const content = useMemo(() => {
    const order = localOrder[orderKey]
    if (!order) return baseContent
    const byId = new Map(baseContent.map((item: any) => [item.id, item]))
    return order.map(id => byId.get(id)).filter(Boolean)
  }, [baseContent, localOrder, orderKey])

  // Wallpaper filter derived from active room
  const activeRoomIndex = activeRoomId ? visibleRooms.findIndex(r => r.id === activeRoomId) : -1
  const wallpaperFilter = activeRoomIndex >= 0
    ? ROOM_FILTERS[activeRoomIndex % ROOM_FILTERS.length]
    : DEFAULT_FILTER
  const overlayColor = activeRoomIndex >= 0
    ? ROOM_OVERLAYS[activeRoomIndex % ROOM_OVERLAYS.length]
    : DEFAULT_OVERLAY

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    setShowToast(true)
  }

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Check if user is logged in
  useEffect(() => {
    fetch('/api/user', { credentials: 'include' })
      .then(r => { if (r.ok) setIsLoggedIn(true) })
      .catch(() => {})
  }, [])

  // Navigate to room
  const goToRoom = useCallback((roomId: string | null) => {
    if (roomId === activeRoomId || roomFade !== 'visible') return
    setRoomFade('out')
    setTimeout(() => {
      setActiveRoomId(roomId)
      setRoomFade('in')
      setTimeout(() => setRoomFade('visible'), 300)
    }, 200)
  }, [activeRoomId, roomFade])

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = content.map((item: any) => item.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const newIds = arrayMove(ids, oldIndex, newIndex)
    setLocalOrder(prev => ({ ...prev, [orderKey]: newIds }))
  }, [content, orderKey])

  useEffect(() => {
    if (!showToast) return
    const t = setTimeout(() => setShowToast(false), 2000)
    return () => clearTimeout(t)
  }, [showToast])

  // Image sizes based on row context
  const getImageSizes = (rowType: RowType, splitPercent?: number) => {
    if (rowType === 'hero' || rowType === 'breath') return '(max-width: 768px) 100vw, 920px'
    if (splitPercent) return `(max-width: 768px) 100vw, ${Math.round(920 * splitPercent / 100)}px`
    if (rowType === 'trio') return '(max-width: 768px) 50vw, 300px'
    return '(max-width: 768px) 50vw, 460px'
  }

  // Layout mode config
  const layoutConfig = useMemo(() => {
    switch (layoutMode) {
      case 'breathe':
        return { gap: 14, tileRadius: 8, containerPadding: 20, tileShadow: '0 2px 12px rgba(0,0,0,0.1)', gridBlockRadius: 0, gridBlockShadow: 'none', gridBlockOverflow: 'visible' as const }
      case 'grid':
        return { gap: 4, tileRadius: 2, containerPadding: 0, tileShadow: 'none', gridBlockRadius: 6, gridBlockShadow: '0 8px 60px rgba(0,0,0,0.35), 0 2px 12px rgba(0,0,0,0.2)', gridBlockOverflow: 'hidden' as const }
      default: // editorial
        return { gap: 3, tileRadius: 2, containerPadding: 0, tileShadow: 'none', gridBlockRadius: 6, gridBlockShadow: '0 8px 60px rgba(0,0,0,0.35), 0 2px 12px rgba(0,0,0,0.2)', gridBlockOverflow: 'hidden' as const }
    }
  }, [layoutMode])

  // Build rows from content based on layout mode
  const rows = useMemo(() => {
    if (layoutMode === 'grid') return buildGridRows(content, isMobile)
    return buildEditorialRows(content)
  }, [content, layoutMode, isMobile])

  // Reusable tile renderer
  const renderTileContent = (item: any, index: number, rowType: RowType, isHero: boolean) => {
    const isVideo = item.type === 'image' && item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)
    const tileAspect = resolveAspect(item.aspect, item.type, item.url)
    const isGridMode = layoutMode === 'grid'

    // For thought tiles — glassmorphic annotation style
    if (item.type === 'thought') {
      const text = item.title || ''
      const len = text.length
      const typo = len <= 6
        ? 'text-[28px] font-light tracking-[-0.035em] leading-none'
        : len <= 20
        ? 'text-[18px] font-light tracking-[-0.025em] leading-tight'
        : len <= 60
        ? 'text-[15px] font-light tracking-[-0.01em] leading-snug'
        : 'text-[15px] font-light tracking-[-0.01em] leading-relaxed'

      return (
        <div
          className="w-full h-full flex items-center justify-center p-5"
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(20px) saturate(120%)',
            WebkitBackdropFilter: 'blur(20px) saturate(120%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: `${layoutConfig.tileRadius}px`,
            fontFamily: "'DM Sans', sans-serif",
            minHeight: isGridMode ? undefined : '200px',
          }}
          data-tile-id={item.id}
          data-tile-type="thought"
        >
          <p className={`whitespace-pre-wrap text-center text-white ${typo}`} style={{ fontWeight: 300, lineHeight: 1.5 }}>
            {text}
          </p>
        </div>
      )
    }

    // For grid mode - force square crop
    if (isGridMode) {
      if (isVideo) {
        return (
          <div className="aspect-square overflow-hidden" style={{ borderRadius: `${layoutConfig.tileRadius}px` }} data-tile-id={item.id} data-tile-type={item.type}>
            <VideoTile src={item.url} onWidescreen={noop} aspect="square" isPublicHero={false} />
          </div>
        )
      }
      if (item.type === 'image') {
        return (
          <div className="aspect-square overflow-hidden" style={{ borderRadius: `${layoutConfig.tileRadius}px` }} data-tile-id={item.id} data-tile-type={item.type}>
            <Image src={item.url} alt={item.title || ''} width={400} height={400} sizes="(max-width: 768px) 50vw, 366px"
              className="w-full h-full object-cover transition-opacity duration-300"
              loading={index < 6 ? "eager" : "lazy"} priority={index < 2} quality={75} />
          </div>
        )
      }
      return (
        <div className="aspect-square overflow-hidden" style={{ borderRadius: `${layoutConfig.tileRadius}px` }} data-tile-id={item.id} data-tile-type={item.type}>
          <ContentCard content={item} isMobile={isMobile} tileSize={1} aspect="square" isPublicView />
        </div>
      )
    }

    // Editorial / Breathe modes - constrain all images to prevent giant tiles
    const maxH = isHero
      ? (isMobile ? '65vh' : '70vh')
      : rowType === 'breath'
      ? (isMobile ? '55vh' : '60vh')
      : (isMobile ? '50vh' : '55vh')
    const videoMaxH = isHero
      ? (isMobile ? '70vh' : '80vh')
      : (isMobile ? '50vh' : '55vh')

    if (isVideo) {
      return (
        <div
          className="fp-tile overflow-hidden w-full"
          style={{ maxHeight: videoMaxH, borderRadius: `${layoutConfig.tileRadius}px`, boxShadow: layoutConfig.tileShadow }}
          data-tile-id={item.id}
          data-tile-type={item.type}
        >
          <VideoTile src={item.url} onWidescreen={noop} aspect={tileAspect} isPublicHero={isHero} />
        </div>
      )
    }

    if (item.type === 'image') {
      return (
        <div
          className="fp-tile overflow-hidden w-full"
          style={{ maxHeight: maxH, borderRadius: `${layoutConfig.tileRadius}px`, boxShadow: layoutConfig.tileShadow }}
          data-tile-id={item.id}
          data-tile-type={item.type}
        >
          <Image src={item.url} alt={item.title || ''}
            width={isHero ? 920 : 600} height={isHero ? 920 : 600}
            sizes={getImageSizes(rowType)}
            className="w-full h-auto object-cover transition-opacity duration-300"
            style={{ maxHeight: maxH }}
            loading={index < 2 ? "eager" : "lazy"}
            priority={index === 0}
            quality={75}
            fetchPriority={index === 0 ? 'high' : undefined}
            onError={(e) => {
              const container = (e.target as HTMLElement).closest('[data-tile-id]')
              if (container) (container as HTMLElement).style.background = 'rgba(0,0,0,0.3)'
            }}
          />
        </div>
      )
    }

    // Embeds/links
    return (
      <div
        className="fp-tile overflow-hidden w-full"
        style={{ maxHeight: maxH, borderRadius: `${layoutConfig.tileRadius}px`, boxShadow: layoutConfig.tileShadow }}
        data-tile-id={item.id}
        data-tile-type={item.type}
      >
        <ContentCard content={item} isMobile={isMobile} tileSize={isHero ? 3 : 1} aspect={tileAspect} isPublicView />
      </div>
    )
  }

  // Active drag item for overlay
  const activeDragItem = activeDragId ? content.find((item: any) => item.id === activeDragId) : null

  // Flatten rows to tile IDs for DndContext
  const allTileIds = useMemo(() => content.map((item: any) => item.id), [content])

  // Track global tile index across rows for loading priority
  let globalIdx = 0

  // Render a single row
  const renderRow = (row: LayoutRow, rowIdx: number) => {
    const gapPx = layoutConfig.gap

    if (row.type === 'hero' || row.type === 'breath') {
      const tile = row.tiles[0]
      const idx = globalIdx++
      const isHero = row.type === 'hero' && rowIdx === 0
      const tileEl = renderTileContent(tile, idx, row.type, isHero)
      const wrapStyle: React.CSSProperties = { width: '100%' }

      if (interactive) {
        return (
          <div key={`row-${rowIdx}`} style={{ marginBottom: `${gapPx}px` }}>
            <SortableTile id={tile.id} className="tile-container tile-enter" style={wrapStyle}>
              {tileEl}
            </SortableTile>
          </div>
        )
      }
      return (
        <div key={`row-${rowIdx}`} className="tile-container tile-enter" style={{ ...wrapStyle, marginBottom: `${gapPx}px`, animationDelay: `${idx * 40}ms` }}>
          {tileEl}
        </div>
      )
    }

    if (row.type === 'pair') {
      const [a, b] = row.tiles
      const [splitA, splitB] = row.splitRatio || [50, 50]
      const idxA = globalIdx++
      const idxB = globalIdx++

      // On mobile: side-by-side for landscape-ish, stacked for portrait
      const mobileStack = isMobile && (
        resolveAspect(a.aspect, a.type, a.url) === 'tall' ||
        resolveAspect(b.aspect, b.type, b.url) === 'tall'
      )

      const rowStyle: React.CSSProperties = mobileStack
        ? { display: 'flex', flexDirection: 'column', gap: `${gapPx}px`, marginBottom: `${gapPx}px` }
        : { display: 'flex', flexDirection: 'row', gap: `${gapPx}px`, marginBottom: `${gapPx}px` }

      const tileAStyle: React.CSSProperties = mobileStack ? { width: '100%' } : { flex: `0 0 calc(${splitA}% - ${gapPx / 2}px)`, minWidth: 0 }
      const tileBStyle: React.CSSProperties = mobileStack ? { width: '100%' } : { flex: `0 0 calc(${splitB}% - ${gapPx / 2}px)`, minWidth: 0 }

      const tileElA = renderTileContent(a, idxA, 'pair', false)
      const tileElB = renderTileContent(b, idxB, 'pair', false)

      if (interactive) {
        return (
          <div key={`row-${rowIdx}`} style={rowStyle}>
            <SortableTile id={a.id} className="tile-container tile-enter" style={tileAStyle}>
              {tileElA}
            </SortableTile>
            <SortableTile id={b.id} className="tile-container tile-enter" style={tileBStyle}>
              {tileElB}
            </SortableTile>
          </div>
        )
      }
      return (
        <div key={`row-${rowIdx}`} style={rowStyle}>
          <div className="tile-container tile-enter" style={{ ...tileAStyle, animationDelay: `${idxA * 40}ms` }}>
            {tileElA}
          </div>
          <div className="tile-container tile-enter" style={{ ...tileBStyle, animationDelay: `${idxB * 40}ms` }}>
            {tileElB}
          </div>
        </div>
      )
    }

    if (row.type === 'trio') {
      const [a, b, c] = row.tiles
      const idxA = globalIdx++
      const idxB = globalIdx++
      const idxC = globalIdx++

      // Mobile: first tile full-width, bottom two side-by-side
      if (isMobile) {
        const tileElA = renderTileContent(a, idxA, 'trio', false)
        const tileElB = renderTileContent(b, idxB, 'trio', false)
        const tileElC = renderTileContent(c, idxC, 'trio', false)

        if (interactive) {
          return (
            <div key={`row-${rowIdx}`} style={{ marginBottom: `${gapPx}px` }}>
              <div style={{ marginBottom: `${gapPx}px` }}>
                <SortableTile id={a.id} className="tile-container tile-enter" style={{ width: '100%' }}>
                  {tileElA}
                </SortableTile>
              </div>
              <div style={{ display: 'flex', gap: `${gapPx}px` }}>
                <SortableTile id={b.id} className="tile-container tile-enter" style={{ flex: '1 1 50%', minWidth: 0 }}>
                  {tileElB}
                </SortableTile>
                <SortableTile id={c.id} className="tile-container tile-enter" style={{ flex: '1 1 50%', minWidth: 0 }}>
                  {tileElC}
                </SortableTile>
              </div>
            </div>
          )
        }
        return (
          <div key={`row-${rowIdx}`} style={{ marginBottom: `${gapPx}px` }}>
            <div className="tile-container tile-enter" style={{ width: '100%', marginBottom: `${gapPx}px`, animationDelay: `${idxA * 40}ms` }}>
              {tileElA}
            </div>
            <div style={{ display: 'flex', gap: `${gapPx}px` }}>
              <div className="tile-container tile-enter" style={{ flex: '1 1 50%', minWidth: 0, animationDelay: `${idxB * 40}ms` }}>
                {tileElB}
              </div>
              <div className="tile-container tile-enter" style={{ flex: '1 1 50%', minWidth: 0, animationDelay: `${idxC * 40}ms` }}>
                {tileElC}
              </div>
            </div>
          </div>
        )
      }

      // Desktop: three equal columns
      const tileElA = renderTileContent(a, idxA, 'trio', false)
      const tileElB = renderTileContent(b, idxB, 'trio', false)
      const tileElC = renderTileContent(c, idxC, 'trio', false)

      const triStyle: React.CSSProperties = { display: 'flex', gap: `${gapPx}px`, marginBottom: `${gapPx}px` }
      const triTileStyle: React.CSSProperties = { flex: '1 1 33.333%', minWidth: 0 }

      if (interactive) {
        return (
          <div key={`row-${rowIdx}`} style={triStyle}>
            <SortableTile id={a.id} className="tile-container tile-enter" style={triTileStyle}>
              {tileElA}
            </SortableTile>
            <SortableTile id={b.id} className="tile-container tile-enter" style={triTileStyle}>
              {tileElB}
            </SortableTile>
            <SortableTile id={c.id} className="tile-container tile-enter" style={triTileStyle}>
              {tileElC}
            </SortableTile>
          </div>
        )
      }
      return (
        <div key={`row-${rowIdx}`} style={triStyle}>
          <div className="tile-container tile-enter" style={{ ...triTileStyle, animationDelay: `${idxA * 40}ms` }}>
            {tileElA}
          </div>
          <div className="tile-container tile-enter" style={{ ...triTileStyle, animationDelay: `${idxB * 40}ms` }}>
            {tileElB}
          </div>
          <div className="tile-container tile-enter" style={{ ...triTileStyle, animationDelay: `${idxC * 40}ms` }}>
            {tileElC}
          </div>
        </div>
      )
    }

    return null
  }

  // The grid — the entire product
  const gridElement = (
    <div
      style={{
        opacity: roomFade === 'out' ? 0 : 1,
        transition: 'opacity 200ms ease-out',
      }}
    >
      {rows.map((row, rowIdx) => {
        // Reset globalIdx tracking is handled inline
        return renderRow(row, rowIdx)
      })}
    </div>
  )

  return (
    <div className="min-h-screen relative flex flex-col" style={{ background: theme.colors.background, color: theme.colors.text, '--fp-glass': theme.colors.glass, '--fp-text-muted': theme.colors.textMuted } as React.CSSProperties}>
      {/* Wallpaper layer */}
      {footprint.background_url && (
        <div className="fixed inset-0 z-0">
          <Image
            src={footprint.background_url}
            alt=""
            fill
            priority
            quality={60}
            sizes="100vw"
            className={`object-cover transition-opacity duration-700 ${wallpaperLoaded ? 'opacity-100' : 'opacity-0'}`}
            style={{
              filter: footprint.background_blur !== false ? wallpaperFilter : 'none',
              transition: 'filter 0.8s ease',
            }}
            onLoad={() => setWallpaperLoaded(true)}
          />
          <div
            className="absolute inset-0 transition-colors duration-800"
            style={{ backgroundColor: overlayColor }}
          />
        </div>
      )}
      <WeatherEffect type={footprint.weather_effect || null} />

      {/* Draft banner */}
      {isDraft && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-2 bg-white/[0.06] backdrop-blur-sm border-b border-white/[0.08]">
          <span className="text-[11px] text-white/40 tracking-[0.15em] font-mono lowercase">draft</span>
        </div>
      )}

      {/* Top-right action */}
      <div className="fixed top-5 right-4 md:right-6 z-30">
        {isLoggedIn ? (
          <a
            href={`/${footprint.username}/home`}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition"
          >
            <svg className="w-3.5 h-3.5 text-white/40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </a>
        ) : (
          <PlusButton slug={footprint.slug} />
        )}
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Sky — wallpaper breathing space above content */}
        <div style={{ height: '80px' }} />

        {/* Masthead — name commands the space, adapts to length */}
        <RemoveBubble slug={footprint.slug}>
          <header className="pb-4 md:pb-5 flex flex-col items-center px-4">
            <h1
              className={`uppercase ${
                (footprint.display_name || '\u00e6').length <= 6
                  ? 'text-4xl md:text-6xl tracking-[0.22em] font-normal'
                  : (footprint.display_name || '\u00e6').length <= 12
                  ? 'text-3xl md:text-5xl tracking-[0.14em] font-normal'
                  : 'text-2xl md:text-4xl tracking-[0.06em] font-light'
              }`}
              style={{
                color: theme.colors.text,
                opacity: 0.92,
                textShadow: footprint.background_url ? '0 2px 20px rgba(0,0,0,0.9)' : 'none',
              }}
            >
              {footprint.display_name || '\u00e6'}
            </h1>
          </header>
        </RemoveBubble>

        {/* Room nav — dot-separated, whispered chapters */}
        {visibleRooms.length > 1 && (
          <div className="flex items-center justify-center gap-0 mb-4 md:mb-6 font-mono overflow-x-auto hide-scrollbar px-4">
            {visibleRooms.map((room, i) => (
              <span key={room.id} className="flex items-center whitespace-nowrap">
                {i > 0 && <span className="mx-2.5" style={{ color: 'rgba(255,255,255,0.2)', fontSize: '8px' }}>·</span>}
                <button
                  onClick={() => goToRoom(room.id)}
                  className="transition-all duration-300"
                  style={{
                    fontSize: '11px',
                    letterSpacing: '2.5px',
                    textTransform: 'lowercase',
                    fontWeight: activeRoomId === room.id ? 400 : 300,
                    color: activeRoomId === room.id ? 'white' : 'rgba(255,255,255,0.4)',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  {room.name}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* The Grid — the product */}
        <div
          className="fp-grid-container mx-auto w-full"
          style={{
            maxWidth: '920px',
            paddingLeft: isMobile ? `${layoutConfig.containerPadding || 3}px` : `${Math.max(layoutConfig.containerPadding, 40)}px`,
            paddingRight: isMobile ? `${layoutConfig.containerPadding || 3}px` : `${Math.max(layoutConfig.containerPadding, 40)}px`,
          }}
        >
          <div
            className="fp-grid-arrive"
            style={{
              borderRadius: `${layoutConfig.gridBlockRadius}px`,
              overflow: layoutConfig.gridBlockOverflow,
              boxShadow: layoutConfig.gridBlockShadow,
            }}
          >
            {interactive ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext items={allTileIds} strategy={rectSortingStrategy}>
                  {gridElement}
                </SortableContext>
                <DragOverlay>
                  {activeDragItem ? (
                    <div
                      className="tile-container"
                      style={{ transform: 'rotate(1deg)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', overflow: 'hidden', maxWidth: '400px' }}
                    >
                      {renderTileContent(activeDragItem, 0, 'hero', false)}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            ) : (
              gridElement
            )}
          </div>
        </div>

        {content.length === 0 && (
          <p className="text-center py-16 text-sm" style={{ color: theme.colors.textMuted }}>
            nothing here.
          </p>
        )}

        {/* Floor — wallpaper breathing space below content */}
        <div style={{ height: '120px' }} />

        {/* Footer — quiet share icon */}
        <div className="py-10 flex items-center justify-center">
          <button
            onClick={handleShare}
            className="group text-white/[0.12] hover:text-white/40 transition-colors duration-500"
            aria-label="Share"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.06a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.25 8.81" />
            </svg>
          </button>
        </div>
      </div>

      {/* Rolodex drawer */}
      {isLoggedIn && (
        <>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open saved footprints"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-10 h-1 rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition-colors duration-200"
          />
          <RolodexDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </>
      )}

      {/* Floating CTA bar — shown on published rooms, self-hides for published owners */}
      {!isDraft && (
        <FloatingCtaBar username={footprint.username} serial={serial} />
      )}

      {/* Copied toast */}
      {showToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-white/[0.08] backdrop-blur-sm rounded-md px-5 py-2 text-white/60 text-sm materialize">
          copied.
        </div>
      )}
    </div>
  )
}
