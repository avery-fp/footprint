'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Image from 'next/image'
import UnifiedTile from '@/components/UnifiedTile'
import SAspectShell from '@/components/SAspectShell'

import WeatherEffect from '@/components/WeatherEffect'
import { RemoveBubble } from '@/components/RemoveBubble'
import { PlusButton } from '@/components/PlusButton'
import FloatingCtaBar from '@/components/FloatingCtaBar'
import SovereignTile from '@/components/SovereignTile'
import ClaimPlaque from '@/components/ClaimPlaque'
import DraftClaimForm from '@/components/DraftClaimForm'
import GiftModal from '@/components/GiftModal'
import CommandLayer from '@/components/CommandLayer'
import OwnerActionBar from '@/components/OwnerActionBar'
import OwnerTileSheet from '@/components/OwnerTileSheet'
import RoomLockOverlay from '@/components/RoomLockOverlay'
import EditAccessScreen from '@/components/EditAccessScreen'
import { uploadWithProgress as uploadShared, resizeImage as resizeShared, detectImageAspect as detectAspectShared } from '@/lib/upload'
import { getGridLayout, tileAspectRatio, LAYOUT_LABELS, type RoomLayout } from '@/lib/grid-layouts'
import LayoutToggle from '@/components/LayoutToggle'
import { glassStyle } from '@/lib/glass'
import { useDepthExpansion } from '@/hooks/useDepthExpansion'
import { moveChild, removeChild } from '@/lib/container-child-ops'
import { getCollectionRenderRadius, shouldRenderCollectionTile } from '@/lib/collection-window'
import { getGridClass, resolveAspect, isVideoTile } from '@/lib/media/aspect'
import { getFootprintDisplayTitle } from '@/lib/footprint'
import { getRoomAtmosphere } from '@/lib/roomAtmosphere'
import { wallpaperSourceFromTile } from '@/lib/tile-rendering'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Room {
  id: string
  name: string
  layout?: string
  content: any[]
  is_locked?: boolean
  has_passcode?: boolean
}

interface PublicPageProps {
  footprint: any
  content: any[]
  rooms: Room[]
  theme: any
  serial: string
  pageUrl: string
  isDraft?: boolean
  isOwnerHinted?: boolean
  containerMeta?: Record<string, { childCount: number; firstThumb: string | null }>
  ownerEmail?: string | null
  /**
   * When true, render EditAccessScreen as a full-page overlay above the
   * public render. Set by the page server component when ?edit=1 is in
   * the URL and the visitor is not yet authenticated. After successful
   * verify, EditAccessScreen redirects to the clean /{slug} URL.
   */
  wantsEditOverlay?: boolean
}

// Room subtitles removed — the rooms speak for themselves
// Wallpaper filter + overlay per room live in lib/roomAtmosphere.ts so
// the editor and public render the same room with the same atmosphere.

// Module-scope component. Defined inside PublicPage it became a fresh
// function reference each render — React saw a new component type for
// every tile and unmounted/remounted the entire tile subtree (iframes,
// videos, IntersectionObservers) on every parent state change. Hoisting
// keeps each tile's instance stable across re-renders.
function SortableTileWrapper({ item, idx, children, className, style: extraStyle, disabled }: { item: any; idx: number; children: React.ReactNode; className?: string; style?: React.CSSProperties; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled })
  // Desktop drag activation used to paint the wrapper on a new
  // compositor layer at the same instant it gained a translate3d, a
  // shadow, and a zIndex bump. Promoting the layer at that moment
  // recentered its paint box around the freshly-added shadow and
  // read as an upward pop, because the shadow extends downward and
  // MouseSensor's 4px distance threshold fires mid-motion. Removing
  // scale(1.04) in #410 was correct but not sufficient. We now
  // pre-promote the layer (baseline translate3d(0,0,0) + will-change)
  // and keep the boxShadow property present at all times (none → real)
  // so neither the transform stack nor the paint bounds change
  // discontinuously at activation. Mobile uses delay:200, so any
  // layer settling completes during the hold — the pop wasn't visible
  // there. Transition stays suppressed while dragging so the active
  // tile tracks the cursor 1:1.
  const baseTransform = CSS.Transform.toString(transform) || 'translate3d(0,0,0)'
  const style: React.CSSProperties = {
    transform: baseTransform,
    transition: isDragging ? 'none' : (transition || 'transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1)'),
    willChange: 'transform',
    boxShadow: isDragging ? '0 18px 48px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.35)' : 'none',
    ...(isDragging ? {
      zIndex: 50,
      cursor: 'grabbing',
    } : null),
    ...extraStyle,
  }
  return (
    <div ref={setNodeRef} style={style} className={className} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl, isDraft, isOwnerHinted = false, containerMeta = {}, ownerEmail = null, wantsEditOverlay = false }: PublicPageProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)

  // Default to first room
  useEffect(() => {
    if (activeRoomId === null && rooms.length > 0) {
      const visible = rooms.filter(r => r.name && r.name.trim().length > 0)
      if (visible.length > 0) setActiveRoomId(visible[0].id)
    }
  }, [rooms])

  // wallpaperLoaded is the load-fade latch; reset effects live alongside
  // wallpaperUrlLocal further down so prop changes and optimistic owner
  // replacements both clear the latch and fade in fresh bytes.
  const [wallpaperLoaded, setWallpaperLoaded] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [serialFlyout, setSerialFlyout] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [roomFade, setRoomFade] = useState<'visible' | 'out' | 'in'>('visible')
  const [roomNavDocked, setRoomNavDocked] = useState(false)

  // ── Owner editor surface ──
  // editorMode is the toggle behind the corner home button: when off,
  // strangers and owners see identical pixels. When on, owner chrome
  // (action bar, layout selector, lock icons, tile sheet) becomes
  // interactive. There is no "edit page" — same page, same DOM, just
  // an overlay of editing affordances.
  // Drafts start in editor mode: the creator just hit "make yours" and
  // landed here to build. There's no edit/done toggle on drafts (the
  // top-right corner surfaces ClaimPlaque instead), so the action bar
  // must already be reachable.
  const [editorMode, setEditorMode] = useState(!!isDraft)
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  // Editor-mode tile-tap scroll anchor. The interceptor sits inside a
  // dnd-kit Sortable wrapper, which exposes role="button" + tabIndex=0
  // for keyboard a11y. Clicking the interceptor moves focus to that
  // focusable ancestor; browsers then auto-scroll the focused element
  // into view, which reads as the page jumping toward the top of the
  // tile (often near the top of the page). We capture the user's
  // scroll position at pointerdown and restore it after the click
  // settles, so the tile they tapped stays put while the editor sheet
  // opens. Read by handleTilePointerDownForAnchor + the layoutEffect
  // below.
  const tileEditScrollAnchor = useRef<number | null>(null)
  // Draft claim sheet — opens from the ClaimPlaque in the top-right of
  // the draft chrome. Collects desired username + owner PIN, then routes
  // to Stripe via /api/checkout.
  const [draftClaimOpen, setDraftClaimOpen] = useState(false)
  // Setup-time controls live behind long-press gestures so they don't
  // earn permanent chrome real estate. Eye flyout surfaces from the
  // top-left home toggle; wallpaper flyout surfaces at the touch point
  // where the owner long-pressed the wallpaper.
  // Editor toolbar uses the OwnerActionBar component for all controls;
  // wallpaper upload flows through there. No long-press gestures.
  // Per-room layout override for live reflow after a toggle click. Reset
  // when the underlying rooms prop changes (e.g. after navigation, when
  // the server-side data is fresh again).
  const [layoutOverride, setLayoutOverride] = useState<Record<string, RoomLayout>>({})
  useEffect(() => { setLayoutOverride({}) }, [rooms])
  // Local rooms mirror so create/rename/delete/reorder mutations apply
  // optimistically. Resync when the prop changes (next nav or server
  // re-render).
  const [roomsLocal, setRoomsLocal] = useState<Room[]>(rooms)
  useEffect(() => { setRoomsLocal(rooms) }, [rooms])
  const draftRoomCreateRef = useRef(false)
  useEffect(() => {
    if (!isDraft || !footprint.serial_number || roomsLocal.length > 0 || draftRoomCreateRef.current) return
    draftRoomCreateRef.current = true
    const tempId = `temp-room-${Date.now()}`
    const fallbackRoom = { id: tempId, name: 'room', layout: 'grid', position: 0, content: [], is_locked: false, has_passcode: false } as any
    setRoomsLocal([fallbackRoom])
    setActiveRoomId(tempId)
    fetch('/api/rooms', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial_number: footprint.serial_number, name: 'room', position: 0, slug: footprint.username }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`create failed ${res.status}`)
        const data = await res.json()
        if (data.room?.id) {
          setRoomsLocal((prev) => prev.map((r) => (r.id === tempId ? { ...r, id: data.room.id } : r)))
          setActiveRoomId(data.room.id)
        }
      })
      .catch((e) => {
        console.error('draft room create failed', e)
        setRoomsLocal([])
        setActiveRoomId(null)
        draftRoomCreateRef.current = false
      })
  }, [isDraft, footprint.serial_number, footprint.username, roomsLocal.length])
  const [renameValue, setRenameValue] = useState<string>('')
  // pillMenuOpenForId — which room pill currently has its inline editor
  // panel open. The same id also drives the rename-input rendering on
  // that pill. One pill open at a time.
  const [pillMenuOpenForId, setPillMenuOpenForId] = useState<string | null>(null)
  // pageSettingsOpen — toggles the page-level settings popover (blur,
  // wallpaper, visibility). Lives behind a single dedicated button in
  // the editor right column, not inside any per-room menu.
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false)
  // Unlocked rooms (visitor-side, per-tab). Mirrors sessionStorage
  // entries so a refresh restores the unlocked state for the same tab,
  // but closing the tab re-locks on next paint per the privacy doctrine.
  const [unlockedRoomIds, setUnlockedRoomIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (typeof window === 'undefined') return
    const init = new Set<string>()
    for (const room of roomsLocal) {
      try {
        if (window.sessionStorage.getItem(`fp_unlock:${footprint.username}:${room.id}`) === '1') {
          init.add(room.id)
        }
      } catch {}
    }
    setUnlockedRoomIds(init)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomsLocal, footprint.username])
  // Mirror props locally so optimistic owner mutations apply instantly.
  const [publishedLocal, setPublishedLocal] = useState<boolean>(footprint.published === true)
  useEffect(() => { setPublishedLocal(footprint.published === true) }, [footprint.published])
  const [displayTitleLocal, setDisplayTitleLocal] = useState<string>(footprint.display_title || '')
  useEffect(() => { setDisplayTitleLocal(footprint.display_title || '') }, [footprint.display_title])
  const [titleEditing, setTitleEditing] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  // Wallpaper local state — mirrors the prop so blur and replace-image
  // mutations apply optimistically. PATCH fires from the change handlers
  // below.
  const [wallpaperUrlLocal, setWallpaperUrlLocal] = useState<string>(footprint.background_url || '')
  useEffect(() => {
    setWallpaperUrlLocal(footprint.background_url || '')
    setWallpaperLoaded(false)
  }, [footprint.background_url])
  useEffect(() => { setWallpaperLoaded(false) }, [wallpaperUrlLocal])
  // Cached-image race: when the wallpaper bytes are already in the
  // browser cache (bfcache on iOS, return visits, prior preload), the
  // <img>'s load event fires before React attaches its synthetic
  // onLoad listener. wallpaperLoaded stays false, the layer stays at
  // opacity-0, and the page reads as if it has no wallpaper — the
  // "default" mobile symptom. Check img.complete on mount and after
  // each URL change to flip the latch when load already happened.
  const wallpaperLayerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!wallpaperUrlLocal) return
    const img = wallpaperLayerRef.current?.querySelector('img')
    if (img && img.complete && img.naturalWidth > 0) {
      setWallpaperLoaded(true)
    }
  }, [wallpaperUrlLocal])
  const [backgroundBlurLocal, setBackgroundBlurLocal] = useState<boolean>(footprint.background_blur !== false)
  useEffect(() => { setBackgroundBlurLocal(footprint.background_blur !== false) }, [footprint.background_blur])

  // ── Edit-access overlay ──
  // When the visitor lands at /{slug}?edit=1 without an owner cookie,
  // surface the email-code login as a full-page overlay above the
  // public render. The overlay is dismissed on successful verify
  // (which redirects to the clean /{slug} URL with the cookie set).
  // If the same URL also carries ?token=…, kick off the unlock flow
  // immediately — magic links short-circuit the email-code form.
  const [editOverlayOpen, setEditOverlayOpen] = useState<boolean>(wantsEditOverlay)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (!token || isOwnerHinted) return
    ;(async () => {
      try {
        const res = await fetch('/api/edit-unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: footprint.username, token }),
        })
        if (res.ok) {
          // Token valid — clean URL and reload so server sees cookie.
          window.location.replace(`/${encodeURIComponent(footprint.username)}`)
        }
      } catch {}
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Integrated Void Transition ──
  const [claimActive, setClaimActive] = useState(false)
  const [giftsRemaining, setGiftsRemaining] = useState<number | null>(null)
  const [giftModalOpen, setGiftModalOpen] = useState(false)

  // Capture URL params at construction time, BEFORE the cleanup effect
  // runs. SovereignTile mounts lazily (after auth check + claim activation),
  // by which point window.location.search is already empty. Without this
  // capture, the Stripe finalize flow breaks silently — session_id and
  // username vanish before SovereignTile can read them.
  const initialParams = useRef(
    typeof window !== 'undefined'
      ? {
          hasClaim: new URLSearchParams(window.location.search).has('claim'),
          sessionId: new URLSearchParams(window.location.search).get('session_id'),
          returnUsername: new URLSearchParams(window.location.search).get('username'),
        }
      : { hasClaim: false, sessionId: null as string | null, returnUsername: null as string | null }
  )
  const wantsClaim = useRef(
    initialParams.current.hasClaim || !!initialParams.current.sessionId
  )

  // Clean URL for everyone (owners too) so ?claim=1 doesn't linger
  useEffect(() => {
    if (wantsClaim.current) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Activate void for visitors only, after auth resolves
  useEffect(() => {
    if (!authChecked || isOwner || !wantsClaim.current) return
    setClaimActive(true)
  }, [authChecked, isOwner])

  const activateClaim = useCallback(() => {
    if (isOwner) return
    setSerialFlyout(false)
    setClaimActive(true)
  }, [isOwner])

  // ── Depth expansion — containers only ──
  const { expanded, showOverlay, children: containerChildren, loadingChildren, expand, collapse, registerRef } = useDepthExpansion()
  const collectionOverlayOpen = showOverlay && !!expanded
  const depthTouchStart = useRef(0)

  // Resolve expanded container label for header bar
  const expandedContainerLabel = useMemo(() => {
    if (!expanded) return ''
    const item = allContent.find(c => c.id === expanded.id)
    return item?.container_label || item?.title || 'Collection'
  }, [expanded, allContent])

  // Content filtering
  const validContent = useMemo(() =>
    allContent.filter(item =>
      (item.type === 'thought' && item.title) ||
      (item.url && item.url !== '')
    ), [allContent])

  const visibleRooms = useMemo(() =>
    roomsLocal
      .filter(r => r.name && r.name.trim().length > 0)
      .map(r => ({
        ...r,
        content: r.content.filter((item: any) =>
          (item.type === 'thought' && item.title) ||
          (item.url && item.url !== '')
        )
      })), [roomsLocal])

  const baseContent = activeRoomId
    ? visibleRooms.find(r => r.id === activeRoomId)?.content || []
    : validContent

  const content = baseContent

  // Wallpaper filter + overlay come from the shared room-atmosphere table
  // so the editor renders the same room with the same atmosphere.
  const activeRoomIndex = activeRoomId ? visibleRooms.findIndex(r => r.id === activeRoomId) : -1
  const activeRoom = activeRoomId ? visibleRooms.find(r => r.id === activeRoomId) : null
  const isSoundRoom = activeRoom?.name?.toLowerCase() === 'sound'
  const activeRoomLocal = activeRoomId ? roomsLocal.find((r) => r.id === activeRoomId) : undefined
  const activeRoomLocked = !!(activeRoomLocal as any)?.is_locked && !isOwner && !!activeRoomId && !unlockedRoomIds.has(activeRoomId)
  const roomLayout: RoomLayout = (
    (activeRoomId && layoutOverride[activeRoomId]) ||
    activeRoom?.layout ||
    'grid'
  ) as RoomLayout
  const layoutConfig = getGridLayout(roomLayout)
  const isHorizontal = roomLayout === 'horizontal'
  const isGrid = roomLayout === 'grid'
  // Grid is the product. Per-room atmospheric shifts (hue/saturation/overlay)
  // bleed through tile gaps and translucent chrome, recoloring grid content
  // as the visitor walks room → room. Lock the wallpaper to defaults in grid
  // mode so the grid stays color-stable; horizontal rooms keep cinematic
  // per-room atmosphere.
  const { filter: wallpaperFilter, overlay: overlayColor } = getRoomAtmosphere(activeRoomIndex, isSoundRoom)

  const handleShare = () => {
    navigator.clipboard.writeText(pageUrl)
    setShowToast(true)
  }

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

  // Owner check: presence of an fp_edit_{slug} cookie implies edit access.
  // The cookie is httpOnly, so we can't read its value — we just probe the
  // edit endpoint. Any failure falls through to visitor state.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/footprint/${encodeURIComponent(footprint.username)}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (r.status === 200) {
          const data = await r.json()
          if (data.owned) {
            setIsOwner(true)
          }
        }
      } catch {
        // Silent — visitor path
      } finally {
        setAuthChecked(true)
      }
    })()
  }, [footprint.username])

  // Owner-only: fetch remaining gift count. Endpoint already gates on
  // edit auth; strangers always get 0 and the button never appears.
  useEffect(() => {
    if (!isOwner || isDraft) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/gifts/remaining?slug=${encodeURIComponent(footprint.username)}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!r.ok) return
        const data = await r.json()
        if (!cancelled) setGiftsRemaining(typeof data?.remaining === 'number' ? data.remaining : 0)
      } catch {
        // non-critical
      }
    })()
    return () => { cancelled = true }
  }, [isOwner, isDraft, footprint.username])

  // Restore scroll position after the tile-edit sheet opens. If the
  // browser scrolled the Sortable wrapper into view on focus during
  // the click, this snaps the page back so the tapped tile stays put
  // while the editor sheet (fixed-positioned) appears below it.
  useEffect(() => {
    if (selectedTileId === null) return
    const anchor = tileEditScrollAnchor.current
    if (anchor === null) return
    tileEditScrollAnchor.current = null
    const restore = () => window.scrollTo({ top: anchor, behavior: 'auto' })
    // Two rAFs: first lets React commit the new render, second runs after
    // the browser has had a chance to apply its focus-induced scroll.
    requestAnimationFrame(() => requestAnimationFrame(restore))
  }, [selectedTileId])

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

  useEffect(() => {
    if (!showToast) return
    const t = setTimeout(() => setShowToast(false), 2000)
    return () => clearTimeout(t)
  }, [showToast])

  useEffect(() => {
    if (visibleRooms.length <= 1) return
    const updateDocked = () => setRoomNavDocked(window.scrollY > 160)
    updateDocked()
    window.addEventListener('scroll', updateDocked, { passive: true })
    return () => window.removeEventListener('scroll', updateDocked)
  }, [visibleRooms.length])

  // Command layer — scroll to tile on search result selection
  const handleTileNavigate = useCallback((tileId: string, roomId: string) => {
    const scrollToTile = () => {
      const el = document.querySelector(`[data-tile-id="${tileId}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.closest('.fp-tile-hover')?.classList.add('fp-tile-highlight')
      setTimeout(() => el.closest('.fp-tile-hover')?.classList.remove('fp-tile-highlight'), 1500)
    }
    if (roomId && roomId !== activeRoomId) {
      goToRoom(roomId)
      setTimeout(scrollToTile, 600)
    } else {
      scrollToTile()
    }
  }, [activeRoomId, goToRoom])

  // ═══════════════════════════════════════════
  // Drag-to-reorder for owners on public page
  // ═══════════════════════════════════════════
  const [draggingTileId, setDraggingTileId] = useState<string | null>(null)
  const [tileSources, setTileSources] = useState<Record<string, 'library' | 'links'>>({})

  // Build tile source map from content
  useEffect(() => {
    const sources: Record<string, 'library' | 'links'> = {}
    for (const item of allContent) {
      sources[item.id] = item.source || 'library'
    }
    setTileSources(sources)
  }, [allContent])

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 4 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  const ownerSensors = useSensors(mouseSensor, touchSensor, keyboardSensor)

  const [localContent, setLocalContent] = useState<any[]>([])
  useEffect(() => { setLocalContent(content) }, [content])

  const [localChildren, setLocalChildren] = useState<any[]>([])
  useEffect(() => { setLocalChildren(containerChildren) }, [containerChildren])
  const collectionRailRef = useRef<HTMLDivElement | null>(null)
  const [collectionActiveIndex, setCollectionActiveIndex] = useState(0)
  const pendingCollectionFocusId = useRef<string | null>(null)
  useEffect(() => {
    setCollectionActiveIndex(0)
  }, [expanded?.id, localChildren.length])
  useEffect(() => {
    const id = pendingCollectionFocusId.current
    if (!id) return
    pendingCollectionFocusId.current = null
    const nextIndex = localChildren.findIndex((child) => child.id === id)
    if (nextIndex >= 0) setCollectionActiveIndex(nextIndex)
    requestAnimationFrame(() => {
      const rail = collectionRailRef.current
      const tile = Array.from(rail?.querySelectorAll<HTMLElement>('[data-collection-child-id]') || [])
        .find((el) => el.dataset.collectionChildId === id)
      tile?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    })
  }, [localChildren])

  const syncCollectionActiveIndex = useCallback(() => {
    const rail = collectionRailRef.current
    if (!rail) return
    const tiles = Array.from(rail.querySelectorAll<HTMLElement>('[data-collection-child-id]'))
    if (tiles.length === 0) return
    const railRect = rail.getBoundingClientRect()
    const railCenter = railRect.left + railRect.width / 2
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < tiles.length; index += 1) {
      const rect = tiles[index].getBoundingClientRect()
      const center = rect.left + rect.width / 2
      const distance = Math.abs(center - railCenter)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    }
    setCollectionActiveIndex((prev) => (prev === bestIndex ? prev : bestIndex))
  }, [])

  useEffect(() => {
    if (!expanded) return
    const rail = collectionRailRef.current
    if (!rail) return
    let rafId = 0
    const sync = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(syncCollectionActiveIndex)
    }
    sync()
    rail.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      rail.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [expanded, localChildren, syncCollectionActiveIndex])

  const displayTitle = useMemo(() => {
    if (displayTitleLocal && displayTitleLocal.trim()) return displayTitleLocal
    return getFootprintDisplayTitle(footprint) || '\u00e6'
  }, [footprint, displayTitleLocal])

  // \u2500\u2500 Optimistic owner mutations: tiles \u2500\u2500
  const handleTileAdded = useCallback((tile: any) => {
    setTileSources((prev) => ({ ...prev, [tile.id]: tile.source || 'library' }))
    setLocalContent((prev) => [...prev, { ...tile, position: prev.length }])
  }, [])

  const handleTileReplaced = useCallback((tempId: string, real: any) => {
    setLocalContent((prev) => prev.map((t) => (t.id === tempId ? { ...real, position: t.position } : t)))
    setTileSources((prev) => {
      const next = { ...prev }
      delete next[tempId]
      next[real.id] = real.source || 'library'
      return next
    })
  }, [])

  const handleTileProgress = useCallback((tempId: string, pct: number) => {
    setLocalContent((prev) => prev.map((t) => (t.id === tempId ? { ...t, _progress: pct } : t)))
  }, [])

  // Patch any field on a tile in-place. Used by the tile sheet for
  // size/aspect/parent_tile_id changes — keep it generic so 4.5 (rooms)
  // and 5 (drag-to-room) can lean on the same helper.
  const handleTileChange = useCallback((id: string, patch: Record<string, unknown>) => {
    setLocalContent((prev) => {
      if (
        Object.prototype.hasOwnProperty.call(patch, 'parent_tile_id') &&
        patch.parent_tile_id != null
      ) {
        return prev.filter((t) => t.id !== id)
      }
      if (
        Object.prototype.hasOwnProperty.call(patch, 'room_id') &&
        (patch.room_id || null) !== (activeRoomId || null)
      ) {
        return prev.filter((t) => t.id !== id)
      }
      return prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    })
  }, [activeRoomId])

  const handleTileDelete = useCallback((id: string) => {
    setLocalContent((prev) => prev.filter((t) => t.id !== id))
    setTileSources((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  // Cross-room move from the tile sheet. Without this, picking a new room
  // in the dropdown left the user on the source room with the tile gone
  // — indistinguishable from delete. Here we relocate the tile inside
  // roomsLocal (source → destination) and navigate to the destination so
  // the move is unmistakable. The PATCH is still fired by the sheet.
  const handleTileMovedToRoom = useCallback(
    (tileId: string, destRoomId: string) => {
      const sourceRoomId = activeRoomId
      if (!sourceRoomId || !destRoomId || sourceRoomId === destRoomId) return
      const sourceTile = localContent.find((t: any) => t.id === tileId)
      if (!sourceTile) return
      const moved = { ...sourceTile, room_id: destRoomId }
      setRoomsLocal((prev) =>
        prev.map((r) => {
          if (r.id === sourceRoomId) {
            return {
              ...r,
              content: ((r as any).content || []).filter((t: any) => t.id !== tileId),
            } as any
          }
          if (r.id === destRoomId) {
            return {
              ...r,
              content: [...(((r as any).content || []) as any[]), moved],
            } as any
          }
          return r
        })
      )
      setLocalContent((prev) => prev.filter((t) => t.id !== tileId))
      goToRoom(destRoomId)
    },
    [activeRoomId, localContent, goToRoom]
  )

  // \u2500\u2500 Optimistic owner mutations: footprint settings \u2500\u2500
  async function patchFootprint(body: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/footprint/${encodeURIComponent(footprint.username)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) console.error('patchFootprint failed', res.status)
    } catch (e) {
      console.error('patchFootprint threw', e)
    }
  }

  const handlePublishedChange = useCallback((next: boolean) => {
    setPublishedLocal(next)
    patchFootprint({ published: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footprint.username])

  const commitTitleEdit = useCallback(() => {
    setTitleEditing(false)
    const trimmed = (displayTitleLocal || '').trim()
    if (trimmed === (footprint.display_title || '').trim()) return
    patchFootprint({ display_title: trimmed })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayTitleLocal, footprint.display_title, footprint.username])

  const handleBlurToggle = useCallback((next: boolean) => {
    setBackgroundBlurLocal(next)
    patchFootprint({ background_blur: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footprint.username])

  const handleWallpaperChange = useCallback((url: string) => {
    setWallpaperUrlLocal(url)
    patchFootprint({ background_url: url })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footprint.username])


  // ── Room mutations ──
  // All optimistic — local state flips first, server PATCH/POST/DELETE
  // fires in the background. No draft buffer.

  const handleRoomRename = useCallback((roomId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setRoomsLocal((prev) => prev.map((r) => (r.id === roomId ? { ...r, name: trimmed } : r)))
    fetch('/api/rooms', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: roomId, slug: footprint.username, name: trimmed }),
    }).catch((e) => console.error('room rename failed', e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footprint.username])

  // Toggle a room between locked and public. Going public → locked
  // prompts for a 4-digit passcode inline; going locked → public just
  // flips the flag (server clears the hash). Optimistic on the local
  // rooms array.
  const handleRoomLockToggle = useCallback((roomId: string) => {
    const room = roomsLocal.find((r) => r.id === roomId)
    if (!room) return
    if (room.is_locked) {
      // Unlocking — flip flag, server drops hash.
      setRoomsLocal((prev) => prev.map((r) => (r.id === roomId ? { ...r, is_locked: false, has_passcode: false } : r)))
      fetch('/api/rooms', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: roomId, slug: footprint.username, is_locked: false }),
      }).catch((e) => console.error('room unlock failed', e))
      return
    }
    // Locking — prompt for 4-digit passcode and PATCH.
    const code = window.prompt('4-digit passcode')?.trim() || ''
    if (!/^\d{4}$/.test(code)) return
    setRoomsLocal((prev) => prev.map((r) => (r.id === roomId ? { ...r, is_locked: true, has_passcode: true } : r)))
    fetch('/api/rooms', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: roomId, slug: footprint.username, is_locked: true, passcode: code }),
    }).catch((e) => console.error('room lock failed', e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomsLocal, footprint.username])

  const handleRoomUnlock = useCallback(async (roomId: string, code: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: code }),
      })
      const data = await res.json().catch(() => ({}))
      return data?.ok === true
    } catch {
      return false
    }
  }, [])

  const handleRoomDelete = useCallback((roomId: string) => {
    const target = roomsLocal.find((r) => r.id === roomId)
    if (!target) return
    const tilesInRoom = ((target as any).content || []) as any[]
    const tileCount = tilesInRoom.length

    // Pick the next room from the VISIBLE list. The prior implementation
    // used roomsLocal.find which would happily land the user on a hidden
    // (unnamed) row — those don't render any pill or content, so the
    // page looked empty even though the tiles still existed. The same
    // visible remainder is the orphan target: mirror the SSR orphan
    // logic in app/[slug]/page.tsx so the immediate UI matches what a
    // refresh would render.
    const visibleRemaining = roomsLocal.filter((r) =>
      r.id !== roomId && r.name && r.name.trim().length > 0
    )
    const orphanTargetId = visibleRemaining[0]?.id || null
    const orphanTargetName = visibleRemaining[0]?.name || 'home'

    const msg = tileCount > 0
      ? `delete this room? ${tileCount} tile${tileCount === 1 ? '' : 's'} will move to ${orphanTargetName}.`
      : 'delete this room?'
    if (!window.confirm(msg)) return

    const prevRooms = roomsLocal
    const prevActive = activeRoomId

    // Move tiles out of the deleted room into the orphan target so they
    // don't blink out of every view between delete and the next refresh.
    // Without this, tiles carry a room_id that no longer matches any
    // room in roomsLocal and appear in no per-room content array — the
    // "lost objects" failure mode.
    setRoomsLocal((prev) =>
      prev
        .filter((r) => r.id !== roomId)
        .map((r) =>
          orphanTargetId && r.id === orphanTargetId && tilesInRoom.length > 0
            ? {
                ...r,
                content: [
                  ...(((r as any).content || []) as any[]),
                  ...tilesInRoom.map((t: any) => ({ ...t, room_id: null })),
                ],
              } as any
            : r
        )
    )

    if (activeRoomId === roomId) {
      setActiveRoomId(orphanTargetId)
    }

    fetch(
      `/api/rooms?id=${encodeURIComponent(roomId)}&slug=${encodeURIComponent(footprint.username)}`,
      { method: 'DELETE', credentials: 'include' }
    )
      .then((res) => {
        if (!res.ok) throw new Error(`delete failed: ${res.status}`)
      })
      .catch((e) => {
        // Server rejected the delete or never responded. Restore the
        // room (with its tiles) and the prior active selection so what
        // the user sees matches what's persisted.
        console.error('room delete failed; reverting', e)
        setRoomsLocal(prevRooms)
        setActiveRoomId(prevActive)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footprint.username, activeRoomId, roomsLocal])

  const handleRoomCreate = useCallback(async () => {
    if (!footprint.serial_number) return
    const name = window.prompt('room name?')?.trim()
    if (!name) return
    const tempId = `temp-room-${Date.now()}`
    const position = roomsLocal.length
    setRoomsLocal((prev) => [...prev, { id: tempId, name, layout: 'grid', position, content: [], is_locked: false, has_passcode: false } as any])
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial_number: footprint.serial_number, name, position, slug: footprint.username }),
      })
      if (!res.ok) throw new Error(`create failed ${res.status}`)
      const data = await res.json()
      if (data.room?.id) {
        setRoomsLocal((prev) => prev.map((r) => (r.id === tempId ? { ...r, id: data.room.id } : r)))
        setActiveRoomId(data.room.id)
      }
    } catch (e) {
      console.error('room create failed', e)
      setRoomsLocal((prev) => prev.filter((r) => r.id !== tempId))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footprint.serial_number, footprint.username, roomsLocal.length])

  // Reset every tile in the room to size=1, aspect='auto'. Useful when
  // the room has drifted into a chaotic mix of L tiles and the owner
  // wants a clean slate. Optimistic per-tile.
  const handleRoomReset = useCallback((roomId: string) => {
    const room = roomsLocal.find((r) => r.id === roomId)
    if (!room) return
    const tiles = (room.content || []) as any[]
    if (tiles.length === 0) return
    if (!window.confirm(`reset ${tiles.length} tile${tiles.length === 1 ? '' : 's'} to defaults?`)) return
    setLocalContent((prev) => prev.map((t) => (tiles.some((x: any) => x.id === t.id) ? { ...t, size: 1, aspect: 'auto' } : t)))
    for (const t of tiles) {
      const source = (tileSources as any)[t.id] || (t.type === 'image' || t.type === 'video' ? 'library' : 'links')
      fetch('/api/tiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, source, slug: footprint.username, size: 1, aspect: 'auto' }),
      }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomsLocal, tileSources, footprint.username])

  // Wallpaper upload — owned here so the per-room ⋯ popover can trigger
  // it. The ⋯ popover renders a hidden file input pointing at this
  // handler; selecting a file uploads to storage, then calls
  // handleWallpaperChange to optimistic-update the page.
  const wallpaperFileInputRef = useRef<HTMLInputElement>(null)
  const [wallpaperUploading, setWallpaperUploading] = useState(false)
  async function handleWallpaperPicked(file: File) {
    if (wallpaperUploading || !footprint.serial_number) return
    setWallpaperUploading(true)
    try {
      const { uploadWithProgress, resizeImage } = await import('@/lib/upload')
      let resized: File
      try { resized = await resizeImage(file, 3840, 0.96) } catch { resized = file }
      const filename = `${footprint.serial_number}/bg-${Date.now()}.jpg`
      const publicUrl = await uploadWithProgress(
        new File([resized], filename, { type: 'image/jpeg' }),
        filename,
        () => {},
        footprint.username,
      )
      handleWallpaperChange(publicUrl)
    } catch (e) {
      console.error('wallpaper upload failed', e)
    } finally {
      setWallpaperUploading(false)
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingTileId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingTileId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Drag may only reorder within the active room. Cross-room migration
    // via drag was removed — too easy to accidentally vacuum tiles into
    // another room when the sticky room nav sits in the path of natural
    // reorder gestures. Moving tiles between rooms requires an explicit
    // UI action (future work), never a drag side-effect.
    const overId = String(over.id)
    if (overId.startsWith('room:')) return

    const oldIndex = localContent.findIndex((item: any) => item.id === active.id)
    const newIndex = localContent.findIndex((item: any) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(localContent, oldIndex, newIndex).map((item: any, index: number) => ({ ...item, position: index }))
    setLocalContent(reordered)

    // Persist positions to server
    const positions = reordered.map((item: any) => ({
      id: item.id,
      source: tileSources[item.id] || 'library',
      position: item.position,
    }))
    fetch('/api/tiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: footprint.username, positions }),
    }).catch(e => console.error('Failed to save tile order:', e))
  }

  function handleChildDelete(child: any) {
    setLocalChildren(prev => removeChild(prev, child.id))
    fetch('/api/tiles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: footprint.username, source: child.source, id: child.id }),
    }).catch(e => console.error('Failed to delete child tile:', e))
  }

  // Promote a child tile out of its container and back into the current
  // room's grid. PATCH clears parent_tile_id AND sets room_id to the
  // current active room so the tile is visible in the grid the user is
  // standing in (children carry a null room_id by default, so without
  // this they'd be orphaned outside any room).
  function handleChildMoveOut(child: any) {
    if (!activeRoomId) return
    setLocalChildren((prev) => removeChild(prev, child.id))
    const moved = { ...child, parent_tile_id: null, room_id: activeRoomId }
    setRoomsLocal((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? ({ ...r, content: [...(((r as any).content || []) as any[]), moved] } as any)
          : r
      )
    )
    setLocalContent((prev) => [...prev, moved])
    fetch('/api/tiles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: child.id,
        source: child.source,
        slug: footprint.username,
        parent_tile_id: null,
        room_id: activeRoomId,
      }),
    }).catch((e) => console.error('Failed to move child out of collection:', e))
  }

  function handleChildMove(idx: number, dir: -1 | 1) {
    const next = moveChild(localChildren, idx, dir)
    if (next === localChildren) return
    pendingCollectionFocusId.current = localChildren[idx]?.id || null
    setLocalChildren(next)
    fetch('/api/tiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: footprint.username,
        positions: next.map((c: any) => ({ id: c.id, source: c.source, position: c.position })),
      }),
    }).catch(e => console.error('Failed to reorder child tiles:', e))
  }

  const [addUrl, setAddUrl] = useState('')
  const [addPending, setAddPending] = useState(false)
  const [childImagePending, setChildImagePending] = useState(false)
  const childImageInputRef = useRef<HTMLInputElement>(null)

  // Clear add-URL input whenever a different (or no) container is open
  useEffect(() => {
    setAddUrl('')
    setAddPending(false)
  }, [expanded?.id])

  async function handleChildAdd() {
    const raw = addUrl.trim()
    if (!raw || addPending || !expanded) return
    setAddPending(true)
    try {
      const res = await fetch(`/api/containers/${expanded.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: footprint.username, url: raw }),
      })
      if (!res.ok) return
      const { child } = await res.json()
      if (child) {
        setLocalChildren(prev => [...prev, child])
        setAddUrl('')
      }
    } catch (e) {
      console.error('Failed to add child tile:', e)
    } finally {
      setAddPending(false)
    }
  }

  async function handleChildImagePick(file: File) {
    if (!expanded || childImagePending || !footprint.serial_number) return
    setChildImagePending(true)
    let previewUrl: string | null = null
    const tempId = `temp-child-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    try {
      const aspect = await detectAspectShared(file).catch(() => 'square')
      previewUrl = URL.createObjectURL(file)
      const tempChild = {
        id: tempId,
        url: previewUrl,
        type: 'image',
        title: null,
        description: null,
        thumbnail_url: null,
        embed_html: null,
        position: localChildren.length,
        size: 1,
        aspect,
        source: 'library' as const,
        parent_tile_id: expanded.id,
        _temp: true,
      }
      pendingCollectionFocusId.current = tempId
      setLocalChildren((prev) => [...prev, tempChild])

      let payload: File = file
      try { payload = await resizeShared(file) } catch { payload = file }
      const filename = `${footprint.serial_number}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      const contentType = payload.type || 'image/jpeg'
      const publicUrl = await uploadShared(
        new File([payload], payload.name || filename, { type: contentType }),
        filename,
        () => {},
        footprint.username,
      )
      const res = await fetch('/api/upload/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: footprint.username,
          url: publicUrl,
          parent_tile_id: expanded.id,
          aspect,
          content_type: contentType,
          size: 1,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.tile) {
        throw new Error(data.error || `Upload registration failed (${res.status})`)
      }
      pendingCollectionFocusId.current = data.tile.id
      setLocalChildren((prev) => prev.map((child) => child.id === tempId ? data.tile : child))
    } catch (e) {
      console.error('Failed to add child image:', e)
      setLocalChildren((prev) => removeChild(prev, tempId))
      window.alert(e instanceof Error ? e.message : 'Upload failed. Please try again.')
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setChildImagePending(false)
    }
  }

  // Per-pill render: no drop targets. Drag may only reorder within
  // the active room — cross-room migration via drag was removed.
  function RoomPillNode({ room }: { room: any }) {
    const isActive = activeRoomId === room.id
    const isOpen = isOwner && editorMode && pillMenuOpenForId === room.id
    // Room pills are NOT drop targets. Drag is reorder-within-room only.
    return (
      <div
        className="relative flex items-center"
      >
        {isOpen ? (
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => { handleRoomRename(room.id, renameValue); setPillMenuOpenForId(null) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') { setRenameValue(room.name); setPillMenuOpenForId(null) }
            }}
            autoFocus
            className="bg-transparent outline-none touch-manipulation"
            style={{
              fontSize: '11px',
              letterSpacing: '2.5px',
              textTransform: 'lowercase',
              fontWeight: 400,
              color: 'white',
              textShadow: '0 1px 8px rgba(0,0,0,0.5)',
              border: 'none',
              borderBottom: '1px dashed rgba(255,255,255,0.30)',
              padding: '8px 2px',
              margin: '-8px -2px',
              minWidth: '4ch',
              width: `${Math.max((renameValue || '').length, 4)}ch`,
            }}
          />
        ) : (
          <button
            onClick={() => {
              if (isActive && isOwner && editorMode) {
                setRenameValue(room.name)
                setPillMenuOpenForId(room.id)
              } else {
                goToRoom(room.id)
              }
            }}
            className="transition-all duration-300 touch-manipulation flex items-center gap-1"
            style={{
              fontSize: '11px',
              letterSpacing: '2.5px',
              textTransform: 'lowercase',
              fontWeight: isActive ? 400 : 300,
              color: isActive ? 'white' : 'rgba(255,255,255,0.4)',
              textShadow: '0 1px 8px rgba(0,0,0,0.5)',
              background: 'none',
              border: 'none',
              padding: '8px 2px',
              margin: '-8px -2px',
              cursor: 'pointer',
            }}
          >
            {room.name}
            {room.is_locked && (
              <svg width="9" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="locked" style={{ opacity: 0.55 }}>
                <rect x="5" y="11" width="14" height="10" rx="1.5" />
                <path d="M8 11V7a4 4 0 018 0v4" />
              </svg>
            )}
          </button>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════
  // LAYOUT — two modes, no black bars anywhere.
  //  · grid:       uniform masonry; native-aspect cells
  //  · horizontal: cinematic rail; native-aspect, fixed rail height
  //
  // Every tile renders at its content's native aspect-ratio via inline
  // style, with the shape pill as fallback when source dims are unknown.
  // Provider embeds (YouTube/Vimeo = 16:9, Spotify = 9:16, SoundCloud =
  // 16:9) are content-native by definition — not letterbox.
  // ═══════════════════════════════════════════
  const displayContent = isOwner ? localContent : content

  // Map any tile to a CSS aspect-ratio string. Provider embeds use their
  // content-native ratio; everything else routes through resolveAspect →
  // tileAspectRatio. SAspectShell still refines image tiles at runtime
  // when their natural dimensions arrive — see renderImageWrapped below.
  const tileAspectCss = (item: any): string => {
    const isMusic = item.type === 'spotify' || item.type === 'apple_music'
    if (isMusic) {
      return item.aspect === 'square' ? '1 / 1' : '9 / 2'
    }

    // Explicit user shape wins, and URL-derived vertical video signals
    // like YouTube Shorts must be resolved before generic provider
    // defaults force embeds to 16:9.
    if (item.aspect === 'square' || item.aspect === 'wide' || item.aspect === 'tall' || item.aspect === 'portrait') {
      return tileAspectRatio(item.aspect)
    }
    const resolved = resolveAspect(item.aspect, item.type, item.url)
    if (resolved === 'square' || resolved === 'wide' || resolved === 'tall' || resolved === 'portrait') {
      return tileAspectRatio(resolved)
    }
    const isEmbedVid = item.type === 'youtube' || item.type === 'vimeo' ||
      item.url?.includes('youtube') || item.url?.includes('youtu.be')
    if (isEmbedVid) return '16 / 9'
    if (item.type === 'soundcloud') return '16 / 9'
    return tileAspectRatio(resolved)
  }


  const fadeStyle = {
    opacity: roomFade === 'out' ? 0 : 1,
    transform: roomFade === 'out' ? 'translateY(6px)' : roomFade === 'in' ? 'translateY(-6px)' : 'translateY(0)',
    transition: 'opacity 250ms ease-out, transform 350ms ease-out',
  }

  // Persist a layout pick from the toggle. Optimistic update on the
  // local rooms array; PATCH /api/rooms with the canonical name.
  const handleLayoutToggle = useCallback((next: RoomLayout) => {
    if (!activeRoomId) return
    fetch('/api/rooms', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeRoomId, slug: footprint.username, layout: next }),
    }).catch((e) => console.error('layout PATCH failed', e))
    // The rooms prop is server-managed; the toggle's optimistic display
    // comes from the prop snapshot used to build activeRoom. After PATCH
    // the next navigation reloads via noStore() for owners, so the new
    // layout reads back fresh on the next render.
    setRoomFade('out')
    setTimeout(() => {
      setRoomFade('in')
      setTimeout(() => setRoomFade('visible'), 300)
    }, 200)
    // Mutate the activeRoom layout in place so the current render reflows
    // without a navigation. visibleRooms is derived from rooms; rooms is
    // the prop. We mirror the change into activeRoom's layout via a
    // closure-captured state escape hatch — easiest is to bump a local
    // override that the render path consults.
    setLayoutOverride((prev) => ({ ...prev, [activeRoomId]: next }))
  }, [activeRoomId, footprint.username])

  // ── Depth expansion: per-tile style ──
  const getDepthStyle = (tileId: string): React.CSSProperties => {
    if (!expanded) return { transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease' }
    if (expanded.id === tileId) return {
      transform: expanded.transform,
      zIndex: 50,
      transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      willChange: 'transform',
    }
    return {
      opacity: 0.1,
      transform: 'scale(0.97)',
      transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
      pointerEvents: 'none' as const,
    }
  }

  // Tile body — inner content shared across all three layouts. The outer
  // wrapper (positioning + aspect-ratio) is layout-specific; this is just
  // the glass card + UnifiedTile + click overlays. Provider embeds, image
  // tiles, video tiles, thoughts all flow through the same body.
  const renderTileBody = (item: any, idx: number) => {
    const isContainer = item.type === 'container'
    const isThisExpanded = expanded?.id === item.id
    return (
      <div
        ref={(el: HTMLDivElement | null) => registerRef(item.id, el)}
        className="w-full h-full relative"
        style={getDepthStyle(item.id)}
      >
        <div
          className={`relative w-full max-w-full h-full overflow-hidden fp-tile-hover rounded-2xl${isSoundRoom ? ' fp-sound-tile' : ''}`}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <UnifiedTile
            item={item}
            index={idx}
            size={item.size || 1}
            aspect={resolveAspect(item.aspect, item.type, item.url)}
            mode="public"
            layout={roomLayout}
            isMobile={isMobile}
            isSoundRoom={isSoundRoom}
            isExpanded={isThisExpanded}
            childCount={containerMeta[item.id]?.childCount}
            firstChildThumb={containerMeta[item.id]?.firstThumb}
          />
          {/* Upload progress overlay — only on optimistic temp tiles
              (created by OwnerActionBar.processFile with _temp + _progress).
              Before this, uploads ran silently and a half-uploaded tile
              looked indistinguishable from a stuck one. Indeterminate
              bar until the XHR progress callback reports the first
              non-zero percentage; deterministic fill after that.
              Pointer-events: none so it never blocks the editor click
              interceptor that opens the tile sheet. No grid/aspect math
              is touched — this is a visual overlay on the existing
              tile body. */}
          {item._temp && (
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 z-10"
              style={{ pointerEvents: 'none' }}
            >
              <div
                style={{
                  height: 3,
                  width: '100%',
                  background: 'rgba(0,0,0,0.35)',
                  overflow: 'hidden',
                }}
              >
                {typeof item._progress === 'number' && item._progress > 0 ? (
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.max(2, Math.min(100, item._progress))}%`,
                      background: 'rgba(255,255,255,0.92)',
                      transition: 'width 180ms linear',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      height: '100%',
                      width: '40%',
                      background: 'rgba(255,255,255,0.85)',
                      animation: 'fp-upload-indeterminate 1.1s ease-in-out infinite',
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
        {/* Editor-mode click interceptor — opens the tile sheet on tap.
            See tileEditScrollAnchor above: we snapshot the scroll Y at
            pointerdown so the page can be restored if the browser scrolls
            the focusable Sortable wrapper into view on focus. */}
        {isOwner && editorMode && !expanded && (
          <div
            className="absolute inset-0 z-20 cursor-pointer"
            onPointerDown={() => { tileEditScrollAnchor.current = window.scrollY }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedTileId(item.id) }}
          />
        )}
        {/* Container click interceptor — only containers are doors. */}
        {isContainer && !expanded && !(isOwner && editorMode) && (
          <div className="absolute inset-0 z-10 cursor-pointer" onClick={() => expand(item.id)} />
        )}
      </div>
    )
  }

  // Per-tile wrapper for grid masonry. Uses getGridClass (the tuned
  // col/row span + aspect engine from lib/media/aspect.ts) so every
  // tile gets the right footprint from size × resolved-aspect.
  const renderMasonryTile = (item: any, idx: number) => {
    const resolved = resolveAspect(item.aspect, item.type, item.url)
    const gridClass = getGridClass(Number(item.size || 1), resolved, isVideoTile(item.type, item.url), item.type)
    const tileBody = renderTileBody(item, idx)
    // Spotify's compact embed locks at ~152px tall. Without self-start, CSS
    // grid stretches the cell to match the tallest sibling in the same row,
    // leaving black space below the iframe. Self-start keeps it fitted.
    const fitClass =
      ((item.type === 'spotify' || item.type === 'apple_music') && resolved === 'wide')
        ? ' self-start'
        : ''
    const wrapperClass = `relative overflow-hidden rounded-2xl ${gridClass}${fitClass}`
    if (isOwner) {
      return (
        <SortableTileWrapper key={item.id} item={item} idx={idx} className={wrapperClass} disabled={!!expanded}>
          {tileBody}
        </SortableTileWrapper>
      )
    }
    return (
      <div key={item.id} className={wrapperClass}>
        {tileBody}
      </div>
    )
  }

  const renderHorizontalTiles = (
    items: any[],
    renderBody: (item: any, idx: number) => React.ReactNode,
    renderOverlay?: (item: any, idx: number) => React.ReactNode,
    includeFade = true,
    sortable = false,
    fitMobileViewport = false,
  ) => {
    const notifyCollectionScroll = () => {
      if (!fitMobileViewport) return
      window.dispatchEvent(new Event('fp:collection-scroll-start'))
    }
    const collectionRenderRadius = getCollectionRenderRadius(isMobile)
    return (
    <div
      ref={fitMobileViewport ? collectionRailRef : undefined}
      className={getGridLayout('horizontal').containerClass}
      style={{
        scrollSnapType: 'x mandatory',
        scrollPaddingLeft: 'max(24px, calc((100vw - min(88vw, 620px)) / 2))',
        WebkitOverflowScrolling: 'touch' as any,
        touchAction: fitMobileViewport ? 'pan-x' : undefined,
        overscrollBehaviorX: fitMobileViewport ? 'contain' : undefined,
        overscrollBehaviorY: fitMobileViewport ? 'none' : undefined,
        paddingLeft: 'max(24px, calc((100vw - min(88vw, 620px)) / 2))',
        paddingRight: 'max(24px, calc((100vw - min(88vw, 620px)) / 2))',
        ...(includeFade ? fadeStyle : {}),
      }}
      onTouchMove={notifyCollectionScroll}
      onScroll={notifyCollectionScroll}
    >
      {items.map((item: any, idx: number) => {
        const aspectCss = tileAspectCss(item)
        const size = Number(item.size || 1)
        const railHeight = size >= 3
          ? (isMobile ? 'min(78vh, 600px)' : 'min(76vh, 700px)')
          : size <= 1
            ? (isMobile ? 'min(58vh, 420px)' : 'min(54vh, 500px)')
            : (isMobile ? 'min(72vh, 540px)' : 'min(70vh, 640px)')
        const [aspectWidth, aspectHeight] = aspectCss.split('/').map(part => Number(part.trim()))
        const aspectRatioValue = Number.isFinite(aspectWidth) && Number.isFinite(aspectHeight) && aspectHeight > 0
          ? aspectWidth / aspectHeight
          : 1
        const viewportFitHeight = `calc(${100 / aspectRatioValue}vw - ${32 / aspectRatioValue}px)`
        const wrapperStyle: React.CSSProperties = {
          height: railHeight,
          aspectRatio: aspectCss,
          ...(fitMobileViewport && isMobile ? {
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: `min(${railHeight}, ${viewportFitHeight})`,
          } : {}),
        }
        const wrapperClass = getGridLayout('horizontal').tileClass
        const shouldMountTile = fitMobileViewport
          ? shouldRenderCollectionTile(idx, items.length, collectionActiveIndex, collectionRenderRadius)
          : true
        const body = (
          <>
            {shouldMountTile ? renderBody(item, idx) : renderCollectionTilePlaceholder(item)}
            {renderOverlay?.(item, idx)}
          </>
        )
        if (sortable && isOwner) {
          return (
            <SortableTileWrapper key={item.id} item={item} idx={idx} className={wrapperClass} style={wrapperStyle} disabled={!!expanded}>
              {body}
            </SortableTileWrapper>
          )
        }
        return (
          <div
            key={item.id}
            className={wrapperClass}
            style={wrapperStyle}
            data-collection-child-id={fitMobileViewport ? item.id : undefined}
          >
            {body}
          </div>
        )
      })}
    </div>
    )
  }

  const renderCollectionTileBody = (child: any, idx: number) => (
    <div className="w-full h-full relative">
      <div
        className={`relative w-full max-w-full h-full overflow-hidden fp-tile-hover rounded-2xl${isSoundRoom ? ' fp-sound-tile' : ''}`}
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <UnifiedTile
          item={{
            id: child.id,
            url: child.url,
            type: child.type,
            title: child.title || null,
            description: child.description || null,
            thumbnail_url: child.thumbnail_url || null,
            embed_html: child.embed_html || null,
            render_mode: child.render_mode,
            artist: child.artist,
            thumbnail_url_hq: child.thumbnail_url_hq,
            media_id: child.media_id,
          }}
          index={idx}
          size={child.size || 1}
          aspect={resolveAspect(child.aspect, child.type, child.url)}
          mode="public"
          layout="horizontal"
          isMobile={isMobile}
          isSoundRoom={isSoundRoom}
        />
      </div>
    </div>
  )

  const renderCollectionTilePlaceholder = (child: any) => {
    const previewUrl =
      child.thumbnail_url_hq ||
      child.thumbnail_url ||
      child.poster_url ||
      null

    return (
      <div className="w-full h-full relative">
        <div
          className={`relative w-full max-w-full h-full overflow-hidden rounded-2xl${isSoundRoom ? ' fp-sound-tile' : ''}`}
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'blur(14px)', opacity: 0.32, transform: 'scale(1.04)' }}
            />
          ) : null}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.22) 100%)' }}
          />
        </div>
      </div>
    )
  }

  const renderCollectionOwnerControls = (child: any, idx: number) => isOwner ? (
    <div className="absolute inset-0 z-10 pointer-events-none sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
      <button
        type="button"
        className="absolute top-2 left-2 pointer-events-auto w-7 h-7 flex items-center justify-center rounded-full touch-manipulation transition-colors hover:bg-white/[0.12]"
        style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}
        onClick={(e) => { e.stopPropagation(); handleChildMoveOut(child) }}
        aria-label="Move out of collection"
        title="Move out of collection"
      >
        <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L20 4M20 4h-7M20 4v7M5 8v11a1 1 0 001 1h11" />
        </svg>
      </button>
      <button
        type="button"
        className="absolute top-2 right-2 pointer-events-auto w-7 h-7 flex items-center justify-center rounded-full touch-manipulation transition-colors hover:bg-red-500/30"
        style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}
        onClick={(e) => { e.stopPropagation(); handleChildDelete(child) }}
        aria-label="Remove item"
      >
        <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-auto">
        <button
          type="button"
          className="w-7 h-7 flex items-center justify-center rounded-full touch-manipulation transition-opacity"
          style={{
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,255,255,0.12)',
            opacity: idx === 0 ? 0.3 : 1,
            cursor: idx === 0 ? 'default' : 'pointer',
          }}
          onClick={(e) => { e.stopPropagation(); handleChildMove(idx, -1) }}
          disabled={idx === 0}
          aria-label="Move left"
        >
          <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <button
          type="button"
          className="w-7 h-7 flex items-center justify-center rounded-full touch-manipulation transition-opacity"
          style={{
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,255,255,0.12)',
            opacity: idx === localChildren.length - 1 ? 0.3 : 1,
            cursor: idx === localChildren.length - 1 ? 'default' : 'pointer',
          }}
          onClick={(e) => { e.stopPropagation(); handleChildMove(idx, 1) }}
          disabled={idx === localChildren.length - 1}
          aria-label="Move right"
        >
          <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  ) : null

  let gridInner: React.ReactNode
  if (isHorizontal) {
    // ── HORIZONTAL: cinematic rail. Each tile is its native aspect at a
    // fixed rail height, so widescreen reads as wide, vertical reads as
    // tall, square reads as square. Width derives. ──
    gridInner = renderHorizontalTiles(displayContent, renderTileBody, undefined, true, true)
  } else {
    // ── GRID: uniform masonry. Every column is the same width; tiles
    //   flow at their native aspect ratios. No size-based span math. ──
    gridInner = (
      <div className={layoutConfig.containerClass} style={{ ...fadeStyle, gridAutoFlow: 'dense', gridAutoRows: 'auto' }}>
        {displayContent.map((item: any, idx: number) => renderMasonryTile(item, idx))}
      </div>
    )
  }

  // The DndContext is hoisted to wrap both the room nav and the grid
  // (see render below) so room pills can register as droppable targets
  // for the send-to-room gesture. Here we just hand back the grid
  // wrapped in a SortableContext for tile reorder.
  const activeGrid = isOwner ? (
    <SortableContext items={displayContent.map((item: any) => item.id)} strategy={rectSortingStrategy}>
      {gridInner}
    </SortableContext>
  ) : gridInner

  return (
    <div
      className={`relative flex min-h-[100dvh] w-full flex-col overflow-x-clip${isGrid ? ' fp-puzzle-page' : ''}`}
      style={{ background: theme.colors.background, color: theme.colors.text, '--fp-glass': theme.colors.glass, '--fp-text-muted': theme.colors.textMuted } as React.CSSProperties}
    >
      {/* Wallpaper layer — GPU composited for 60fps scroll. Keyed by URL so
          a replaced wallpaper drops the previous decoded layer instead of
          repainting it under the new src while the new bytes load. */}
      {wallpaperUrlLocal && (
        <div key={wallpaperUrlLocal} ref={wallpaperLayerRef} className="fixed inset-0 z-0 fp-wallpaper-gpu">
          <Image
            src={wallpaperUrlLocal}
            alt=""
            fill
            priority
            quality={90}
            sizes="100vw"
            fetchPriority="high"
            className={`object-cover transition-opacity duration-700 ${wallpaperLoaded ? 'opacity-100' : 'opacity-0'}`}
            style={{
              filter: claimActive
                ? 'blur(60px) brightness(0.15)'
                : backgroundBlurLocal ? wallpaperFilter : 'none',
              transform: claimActive ? 'none' : backgroundBlurLocal ? 'scale(1.05)' : 'none',
              transition: 'filter 0.8s ease',
            }}
            onLoad={() => setWallpaperLoaded(true)}
            onLoadingComplete={() => setWallpaperLoaded(true)}
          />
          <div
            className="absolute inset-0 transition-all duration-800"
            style={{ backgroundColor: claimActive ? 'rgba(0,0,0,0.8)' : overlayColor }}
          />
        </div>
      )}
      <WeatherEffect type={footprint.weather_effect || null} />
      <CommandLayer
        content={allContent}
        rooms={visibleRooms}
        footprint={footprint}
        theme={theme}
        isMobile={isMobile}
        isOwner={isOwner}
        activeRoomId={activeRoomId}
        onNavigateToTile={handleTileNavigate}
        onNavigateToRoom={goToRoom}
      />

      {/* Draft banner */}
      {isDraft && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-2 bg-white/[0.06] backdrop-blur-sm border-b border-white/[0.08]">
          <span className="text-[11px] text-white/40 tracking-[0.15em] font-mono lowercase">draft</span>
        </div>
      )}

      {/* Top-right corner. On drafts, the edit-toggle is wasted real
          estate (drafts are always editable) — surface the ClaimPlaque
          ("go live → $10") instead, so the draft owner has a path from
          building to paying. On claimed footprints, keep the edit/done
          toggle behavior. */}
      {isDraft && isOwner && !expanded && (
        <div
          className="fixed z-30"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
            right: '16px',
          }}
        >
          <ClaimPlaque onClick={() => setDraftClaimOpen(true)} />
        </div>
      )}
      {/* Gift — owner edit-mode only, lives in the bottom owner cluster
          next to the collection control. Hidden when giftsRemaining hits
          zero, when not in edit mode, and on stranger views. */}
      {!isDraft && isOwner && editorMode && !expanded && !claimActive && giftsRemaining !== null && giftsRemaining > 0 && (
        <button
          type="button"
          aria-label="gift a footprint"
          title="gift a footprint"
          onClick={() => setGiftModalOpen(true)}
          className="fixed z-30 touch-manipulation"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
            right: '64px',
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(28px) saturate(140%)',
            WebkitBackdropFilter: 'blur(28px) saturate(140%)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.62)',
            borderRadius: 999,
            width: 36,
            height: 36,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            transition: 'color 160ms ease',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="8" width="18" height="13" rx="1.5" />
            <path d="M3 12h18" />
            <path d="M12 8v13" />
            <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
          </svg>
        </button>
      )}
      {!isDraft && isOwner && !expanded && (
        <button
          type="button"
          aria-label={editorMode ? 'done editing' : 'edit page'}
          aria-pressed={editorMode}
          onClick={() => setEditorMode((v) => !v)}
          className="fixed z-30 flex items-center justify-center touch-manipulation"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
            right: '16px',
            width: 36,
            height: 36,
            background: 'rgba(0,0,0,0.34)',
            backdropFilter: 'blur(16px) saturate(140%)',
            WebkitBackdropFilter: 'blur(16px) saturate(140%)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: 'rgba(255,255,255,0.92)',
            borderRadius: 999,
            cursor: 'pointer',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
          }}
        >
          {editorMode ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          )}
        </button>
      )}

      {/* Layout toggle + page settings — fixed on the right side beneath
          edit/done. Editor-mode only. Sits below the docked-nav lane so
          it doesn't collide with room pills when the nav is fixed at the
          top. */}
      {isOwner && editorMode && !expanded && (
        <div
          className="fixed z-30 flex flex-col items-center gap-2"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 108px)',
            right: '16px',
          }}
          data-no-wp-press
        >
          <LayoutToggle current={roomLayout} onToggle={(next) => handleLayoutToggle(next)} />
          <button
            type="button"
            onClick={() => setPageSettingsOpen((v) => !v)}
            aria-label="page settings"
            aria-pressed={pageSettingsOpen}
            title="page settings"
            className="p-1.5 rounded-md transition-opacity touch-manipulation"
            style={{ color: 'white', opacity: pageSettingsOpen ? 0.7 : 0.3 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.7' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = pageSettingsOpen ? '0.7' : '0.3' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
        </div>
      )}

      {/* Page settings popover — single home for blur, wallpaper, and
          visibility. Hoisted out of the per-room menu so these page-wide
          controls aren't tied to any one room. */}
      {isOwner && editorMode && !expanded && pageSettingsOpen && (
        <>
          <div className="fixed inset-0 z-[39]" onClick={() => setPageSettingsOpen(false)} />
          <div
            data-no-wp-press
            className="fixed z-40 flex flex-col font-mono"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 108px)',
              right: 56,
              background: 'rgba(0,0,0,0.72)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 12,
              minWidth: 220,
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '10px 12px 6px 12px' }}>
              <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'lowercase' }}>page</span>
            </div>
            <button
              type="button"
              onClick={() => handleBlurToggle(!backgroundBlurLocal)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: 12, letterSpacing: '0.04em', textTransform: 'lowercase', fontFamily: "'DM Mono', monospace", width: '100%' }}
            >
              <span>blur</span>
              <span style={{ color: backgroundBlurLocal ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.40)', fontSize: 10 }}>{backgroundBlurLocal ? 'on' : 'off'}</span>
            </button>
            <button
              type="button"
              onClick={() => wallpaperFileInputRef.current?.click()}
              disabled={wallpaperUploading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: 12, letterSpacing: '0.04em', textTransform: 'lowercase', fontFamily: "'DM Mono', monospace", opacity: wallpaperUploading ? 0.4 : 1 }}
            >
              {wallpaperUploading ? 'uploading…' : 'change wallpaper'}
            </button>
            <button
              type="button"
              onClick={() => handlePublishedChange(!publishedLocal)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: 12, letterSpacing: '0.04em', textTransform: 'lowercase', fontFamily: "'DM Mono', monospace", width: '100%' }}
            >
              <span>visibility</span>
              <span style={{ color: publishedLocal ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.40)', fontSize: 10 }}>{publishedLocal ? 'public' : 'private'}</span>
            </button>
          </div>
        </>
      )}

      {/* Hidden wallpaper file input — kept at the page level so it's
          available regardless of which popover is open. */}
      {isOwner && editorMode && (
        <input
          ref={wallpaperFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleWallpaperPicked(f); e.target.value = '' }}
        />
      )}

      <div
        className={`relative z-10 flex-1 flex flex-col${isOwner && editorMode ? ' pb-[96px]' : ''}`}
        style={{
          filter: claimActive ? 'saturate(0) brightness(0.2)' : 'none',
          opacity: claimActive ? 0.02 : 1,
          transition: 'filter 800ms ease-out, opacity 800ms ease-out',
          pointerEvents: claimActive ? 'none' : 'auto',
        }}
      >
        {/* Sky */}
        <div style={{ height: '100px' }} />

        {/* Masthead */}
        <RemoveBubble slug={footprint.slug}>
          <header className={`pb-4 md:pb-5 flex flex-col items-center px-4${isGrid ? ' fp-puzzle-masthead' : ''}`}>
            {isOwner && editorMode && titleEditing ? (
              <input
                ref={titleInputRef}
                value={displayTitleLocal}
                onChange={(e) => setDisplayTitleLocal(e.target.value)}
                onBlur={commitTitleEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                autoFocus
                className={`bg-transparent outline-none text-center ${
                  displayTitle.length <= 3
                    ? 'text-4xl md:text-6xl tracking-[0em] font-normal'
                    : displayTitle.length <= 6
                    ? 'text-4xl md:text-6xl tracking-[0.08em] font-normal'
                    : displayTitle.length <= 12
                    ? 'text-3xl md:text-5xl tracking-[0.14em] font-normal'
                    : 'text-2xl md:text-4xl tracking-[0.06em] font-light'
                }${isGrid ? ' fp-puzzle-title' : ''}`}
                style={{
                  color: theme.colors.text,
                  opacity: 0.92,
                  textShadow: wallpaperUrlLocal ? '0 2px 20px rgba(0,0,0,0.9)' : 'none',
                  borderBottom: '1px dashed rgba(255,255,255,0.20)',
                  minWidth: '6ch',
                }}
              />
            ) : (
              <h1
                onClick={() => { if (isOwner && editorMode) setTitleEditing(true) }}
                role={isOwner && editorMode ? 'button' : undefined}
                tabIndex={isOwner && editorMode ? 0 : undefined}
                className={`${
                  displayTitle.length <= 3
                    ? 'text-4xl md:text-6xl tracking-[0em] font-normal'
                    : displayTitle.length <= 6
                    ? 'text-4xl md:text-6xl tracking-[0.08em] font-normal'
                    : displayTitle.length <= 12
                    ? 'text-3xl md:text-5xl tracking-[0.14em] font-normal'
                    : 'text-2xl md:text-4xl tracking-[0.06em] font-light'
                }${isGrid ? ' fp-puzzle-title' : ''}${isOwner && editorMode ? ' cursor-text' : ''}`}
                style={{
                  color: theme.colors.text,
                  opacity: 0.92,
                  textShadow: wallpaperUrlLocal ? '0 2px 20px rgba(0,0,0,0.9)' : 'none',
                }}
              >
                {displayTitle}
              </h1>
            )}
          </header>
        </RemoveBubble>

        {/* DndContext hoist — wraps both the room nav and the grid so
            tile drags can land on room pills (the send-to-room gesture)
            in addition to reordering tiles. For non-owners we render
            the same content without the DndContext wrapper. */}
        {(() => {
          const navAndGrid = (
            <>
        {/* Room nav — pills only. No dot dividers (the gap between pills
            is the separator). No edge controls (layout, create, menu) —
            those surface on direct manipulation of the pill itself.
            Tapping a non-active pill navigates; tapping the active pill
            in editor mode opens its inline editor (rename + layout +
            delete). Tapping the empty space after the last pill in
            editor mode prompts for a new room. */}
        {(visibleRooms.length > 1 || (isOwner && editorMode)) && (
          <div className="relative mb-4 h-12 md:mb-6">
            <div
              className={`${roomNavDocked ? 'fixed inset-x-0' : 'absolute inset-x-0'} z-30 flex items-center justify-center px-4 py-2 transition-[top] duration-300`}
              style={{ top: roomNavDocked ? 'calc(env(safe-area-inset-top, 0px) + 60px)' : 0 }}
            >
              <div className="flex max-w-full items-center gap-3 overflow-x-auto hide-scrollbar px-1 font-mono" data-no-wp-press>
                {visibleRooms.map((room) => (
                  <RoomPillNode key={room.id} room={room} />
                ))}

                {/* Tap-empty-after-last-pill — a quiet wide tap-target
                    after the last pill, in editor mode only. No icon;
                    the gap itself is the affordance. Discoverable on
                    the second look, not the first. */}
                {isOwner && editorMode && (
                  <button
                    type="button"
                    aria-label="add room"
                    onClick={handleRoomCreate}
                    className="touch-manipulation whitespace-nowrap"
                    style={{
                      fontSize: '11px',
                      letterSpacing: '2.5px',
                      textTransform: 'lowercase',
                      fontWeight: 300,
                      color: 'rgba(255,255,255,0.45)',
                      background: 'none',
                      border: 'none',
                      padding: '8px 6px',
                      margin: '-8px -2px',
                      cursor: 'pointer',
                    }}
                  >
                    + new room
                  </button>
                )}
              </div>

            </div>

            {/* Room ⋯ popover — vertical menu, single render at the row
                level so it never clips off-screen for edge pills.
                Centered below the nav row. Room-scoped only (rename,
                lock, delete). Page-wide settings live behind the
                page-settings button in the right column. */}
            {isOwner && editorMode && pillMenuOpenForId && activeRoomId === pillMenuOpenForId && (() => {
              const room = roomsLocal.find((r) => r.id === pillMenuOpenForId)
              const locked = !!(room as any)?.is_locked
              const labelStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.40)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'lowercase' }
              const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }
              const actionStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: 12, letterSpacing: '0.04em', textTransform: 'lowercase', padding: '6px 10px', fontFamily: "'DM Mono', monospace" }
              return (
                <>
                  <div className="fixed inset-0 z-[39]" onClick={() => setPillMenuOpenForId(null)} />
                  <div
                    data-no-wp-press
                    className="absolute z-40 flex flex-col font-mono"
                    style={{
                      top: roomNavDocked ? 'calc(env(safe-area-inset-top, 0px) + 60px)' : 44,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(0,0,0,0.72)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: 12,
                      minWidth: 240,
                      overflow: 'hidden',
                    }}
                    // The active pill renders as an autoFocused rename
                    // <input> while this popover is open. Without this
                    // preventDefault, mousedown on lock/delete moves
                    // focus from the input to the button, fires the
                    // input's onBlur (which sets pillMenuOpenForId to
                    // null), and unmounts the popover before the click
                    // event can land — silently swallowing lock and
                    // delete. preventDefault on mousedown blocks the
                    // focus transfer; the click survives.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Room rename — clicking opens inline rename input via the pill itself.
                        Here we just show the room name as a header. */}
                    <div style={{ padding: '10px 12px 6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={labelStyle}>room</span>
                    </div>

                    {/* Rename row */}
                    <button
                      type="button"
                      onClick={() => { setRenameValue(room?.name || ''); /* close popover; the pill input opens via separate state */ setPillMenuOpenForId(null); /* reopen pill rename via cycle: setPillMenuOpenForId again on next tick triggers the rename mode */ setTimeout(() => setPillMenuOpenForId(pillMenuOpenForId), 0) }}
                      style={{ ...rowStyle, ...actionStyle, justifyContent: 'flex-start' }}
                    >
                      rename
                    </button>

                    {/* Lock toggle */}
                    <button
                      type="button"
                      onClick={() => { handleRoomLockToggle(pillMenuOpenForId); setPillMenuOpenForId(null) }}
                      style={{ ...rowStyle, ...actionStyle, justifyContent: 'space-between', width: '100%' }}
                    >
                      <span>{locked ? 'unlock' : 'lock'}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ opacity: 0.65 }}>
                        <rect x="5" y="11" width="14" height="10" rx="1.5" />
                        {locked ? <path d="M8 11V7a4 4 0 018 0v4" /> : <path d="M8 11V7a4 4 0 014-4 4 4 0 014 4" />}
                      </svg>
                    </button>

                    {/* Delete row */}
                    <button
                      type="button"
                      onClick={() => { handleRoomDelete(pillMenuOpenForId); setPillMenuOpenForId(null) }}
                      style={{ ...rowStyle, ...actionStyle, justifyContent: 'flex-start', color: 'rgba(220,90,90,0.85)' }}
                    >
                      delete room
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {/* Grid */}
        <div
          className={`fp-grid-arrive ${isHorizontal ? 'w-full' : `fp-grid-container mx-auto w-full ${isGrid ? 'fp-puzzle-frame' : ''}`}`}
          style={isHorizontal ? undefined : { maxWidth: isGrid ? '900px' : '880px' }}
        >
          {activeGrid}
        </div>

        {/* Room breathing room — every room exhales 96px before any
            subsequent UI. Magazine pacing. No abrupt endings. */}
        <div style={{ height: 96 }} aria-hidden="true" />
            </>
          )
          return isOwner ? (
            <DndContext
              sensors={ownerSensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              {navAndGrid}
            </DndContext>
          ) : navAndGrid
        })()}

        {/* ── Depth overlay: backdrop + close + child tiles ── */}
        {showOverlay && (
          <>
              <div
                className="fixed inset-0 z-[80]"
                style={{
                  backgroundColor: 'rgba(3, 3, 3, 0.96)',
                opacity: expanded ? 1 : 0,
                transition: 'opacity 0.4s ease',
                willChange: 'opacity',
                touchAction: 'none',
              }}
              onClick={collapse}
              onTouchStart={(e) => { depthTouchStart.current = e.touches[0].clientY }}
              onTouchEnd={(e) => { if (e.changedTouches[0].clientY - depthTouchStart.current > 60) collapse() }}
            />
            {/* Expanded container viewport: header bar + horizontal child rail */}
            {expanded && (
              <div
                className="fixed inset-0 z-[90] flex flex-col pointer-events-none"
                style={{
                  opacity: loadingChildren ? 0 : 1,
                  transition: 'opacity 0.3s ease 0.3s',
                  background: 'rgba(3,3,3,0.98)',
                  touchAction: 'pan-x',
                  overscrollBehavior: 'contain',
                }}
              >
                {/* Header bar — container label left, close X right */}
                <div
                  className="pointer-events-auto flex items-center justify-between px-5 flex-shrink-0 relative z-[2]"
                  style={{
                    height: '52px',
                    ...glassStyle,
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 0,
                  }}
                >
                  <span
                    className="font-mono text-white/50 tracking-[0.15em] uppercase truncate"
                    style={{ fontSize: '11px', fontWeight: 400 }}
                  >
                    {expandedContainerLabel}
                  </span>
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-full transition-all touch-manipulation flex-shrink-0 ml-3 hover:bg-white/[0.08] hover:border-white/[0.12]"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                    onClick={collapse}
                    aria-label="Close container"
                  >
                    <svg className="w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Child tiles — horizontal rail fills viewport below header */}
                <div
                  className="flex-1 flex items-center pointer-events-auto overflow-hidden relative z-[1]"
                  style={{ padding: '12px 0', overscrollBehavior: 'contain' }}
                >
                  {localChildren.length > 0 ? (
                    renderHorizontalTiles(localChildren, renderCollectionTileBody, renderCollectionOwnerControls, false, false, true)
                  ) : !loadingChildren ? (
                    <div className="flex items-center justify-center w-full py-12">
                      <span className="text-white/20 font-mono text-xs tracking-widest uppercase">empty</span>
                    </div>
                  ) : null}
                </div>

                {/* Owner-only add URL footer */}
                {isOwner && (
                  <div
                    className="pointer-events-auto flex-shrink-0 flex items-center gap-2 px-4 py-3 relative z-[2]"
                    style={{
                      ...glassStyle,
                      border: 'none',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 0,
                    }}
                  >
                    <input
                      type="url"
                      placeholder="add url…"
                      value={addUrl}
                      onChange={e => setAddUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleChildAdd() }}
                      className="flex-1 bg-transparent text-white/70 placeholder-white/20 outline-none font-mono text-xs"
                      style={{ minWidth: 0 }}
                    />
                    <button
                      onClick={handleChildAdd}
                      disabled={!addUrl.trim() || addPending}
                      className="px-3 py-1 rounded-md font-mono text-xs touch-manipulation"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        color: 'rgba(255,255,255,0.45)',
                        opacity: !addUrl.trim() || addPending ? 0.4 : 1,
                        cursor: !addUrl.trim() || addPending ? 'default' : 'pointer',
                      }}
                    >
                      {addPending ? '…' : 'add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => childImageInputRef.current?.click()}
                      disabled={childImagePending}
                      className="px-3 py-1 rounded-md font-mono text-xs touch-manipulation"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        color: 'rgba(255,255,255,0.45)',
                        opacity: childImagePending ? 0.4 : 1,
                        cursor: childImagePending ? 'progress' : 'pointer',
                      }}
                    >
                      {childImagePending ? '…' : 'image'}
                    </button>
                    <input
                      ref={childImageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={childImagePending}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleChildImagePick(file)
                        e.target.value = ''
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {content.length === 0 && (
          <div className="py-16" />
        )}

        {/* Floor */}
        <div style={{ height: '40px' }} />

      </div>

      {/* Save-to-Rolodex — fixed top-left for visitors. Hidden for owners
          and on drafts. Gated on authChecked to avoid a flash for owners
          before auth resolves. */}
      {!isDraft && authChecked && !isOwner && !claimActive && !collectionOverlayOpen && (
        <div
          className="fixed top-4 left-4"
          style={{ zIndex: expanded ? 60 : 20 }}
        >
          <PlusButton slug={footprint.username} />
        </div>
      )}

      {/* Serial number — fixed bottom-left, tappable for visitors */}
      {!isDraft && serial && !claimActive && !collectionOverlayOpen && (
        <div
          className="fixed bottom-4 left-4 font-mono"
          style={{
            zIndex: expanded ? 60 : 20,
            transition: 'opacity 0.3s ease',
          }}
        >
          <button
            onClick={() => { if (!isOwner) setSerialFlyout(v => !v) }}
            className="select-none touch-manipulation"
            style={{
              color: 'rgba(255,255,255,0.15)',
              fontSize: '11px',
              fontWeight: 300,
              opacity: expanded ? 0.2 : 0.4,
              background: 'none',
              border: 'none',
              padding: '4px 0',
              cursor: isOwner ? 'default' : 'pointer',
              transition: 'opacity 0.3s ease',
            }}
          >
            #{String(serial).padStart(4, '0')}
          </button>

          {/* Claim flyout */}
          {serialFlyout && !isOwner && (
            <>
            <div className="fixed inset-0" onClick={() => setSerialFlyout(false)} />
            <div
              className="absolute bottom-full left-0 mb-2"
              style={{ animation: 'fadeInUp 0.25s ease' }}
            >
              <button
                onClick={activateClaim}
                className="flex items-center touch-manipulation font-mono"
                style={{
                  ...glassStyle,
                  borderRadius: '12px',
                  padding: '12px 16px',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: '12px',
                  fontWeight: 400,
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                footprint.onl {'\u2192'}
              </button>
            </div>
            </>
          )}
        </div>
      )}

      {/* Return affordance — quiet doorway for strangers/recovery only.
          Hidden once the viewer is authenticated as owner (and therefore
          when edit mode is active, which is owner-gated). Server-side
          hint suppresses for owners on first paint (no flash). */}
      {!isOwnerHinted && !isDraft && !isOwner && !collectionOverlayOpen && (
        <a
          href={`/${footprint.username}?edit=1`}
          className="fixed bottom-4 right-4 z-20 font-mono text-[11px] text-white/[0.15] hover:text-white/40 transition-colors duration-300 px-2 py-1 select-none touch-manipulation"
        >
          return
        </a>
      )}

      {/* Floating CTA bar — owned pages are artifacts, not Footprint
          inventory. The acquisition CTA only fires on unclaimed pages
          (drafts) and on the /ae showroom. Never on a stranger's view of
          a paid claimed footprint. */}
      {(isDraft || footprint.username === 'ae') && !claimActive && authChecked && !isOwner && !collectionOverlayOpen && (
        <FloatingCtaBar isOwner={isOwner} />
      )}

      {/* Owner editor toolbar — bottom of page when editor mode is on.
          Four labeled creation verbs (link, text, collection, image).
          That's the entire bar. Page settings (layout, wallpaper,
          public/private) live in the per-room ⋯ popover above. */}
      {isOwner && editorMode && !selectedTileId && !expanded && !claimActive && (
        <OwnerActionBar
          open={editorMode}
          slug={footprint.username}
          activeRoomId={activeRoomId}
          serialNumber={typeof footprint.serial_number === 'number' ? footprint.serial_number : null}
          onTileAdded={handleTileAdded}
          onTileReplaced={handleTileReplaced}
          onTileProgress={handleTileProgress}
          onTileRemoved={handleTileDelete}
        />
      )}


      {/* Edit-access overlay — surfaces when /{slug}?edit=1 is hit
          without an owner cookie. Email-code login on top of the
          public render. After verify it redirects to the clean
          /{slug} URL (cookie set, æ icon picks up). */}
      {editOverlayOpen && !isOwner && (
        <div className="fixed inset-0 z-[60]">
          <EditAccessScreen slug={footprint.username} />
        </div>
      )}

      {/* Locked-room overlay — blurs the active room's grid for
          visitors who haven't unlocked it. Owners always see locked
          rooms unblurred (no overlay). Correct passcode unlocks for
          the tab's lifetime via sessionStorage. */}
      {activeRoomLocked && activeRoomId && (
        <RoomLockOverlay
          onSubmit={(code) => handleRoomUnlock(activeRoomId, code)}
          onCorrect={() => {
            try { window.sessionStorage.setItem(`fp_unlock:${footprint.username}:${activeRoomId}`, '1') } catch {}
            setUnlockedRoomIds((prev) => { const next = new Set(prev); next.add(activeRoomId); return next })
          }}
        />
      )}

      {/* Tile editor sheet — shape, size, collection. Surfaces when an
          owner taps a tile in editor mode. */}
      {isOwner && editorMode && selectedTileId && !expanded && !claimActive && (() => {
        const tile = localContent.find((t) => t.id === selectedTileId)
          || allContent.find((t) => t.id === selectedTileId)
        if (!tile) return null
        const source = tileSources[tile.id] || (tile.type === 'image' || tile.type === 'video' ? 'library' : 'links')
        const containers = (allContent || []).filter((t: any) => t.type === 'container')
        const wallpaperUrl = wallpaperSourceFromTile(tile as any)
        return (
          <OwnerTileSheet
            tile={tile as any}
            source={source as 'library' | 'links'}
            containers={containers as any}
            rooms={visibleRooms.map((r) => ({ id: r.id, name: r.name }))}
            slug={footprint.username}
            onClose={() => setSelectedTileId(null)}
            onTileChange={handleTileChange}
            onTileDelete={handleTileDelete}
            wallpaperUrl={wallpaperUrl}
            onSetWallpaper={handleWallpaperChange}
            onTileMovedToRoom={handleTileMovedToRoom}
          />
        )
      })()}

      {/* Copied toast */}
      {showToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-white/[0.08] backdrop-blur-sm rounded-md px-5 py-2 text-white/60 text-sm materialize">
          copied.
        </div>
      )}

      {/* The Sovereign Tile — self-contained claim flow */}
      {claimActive && !isOwner && (
        <SovereignTile
          slug={footprint.username}
          onDismiss={() => setClaimActive(false)}
          onComplete={(s) => { window.location.href = `/${s}` }}
          sessionId={initialParams.current.sessionId}
          returnUsername={initialParams.current.returnUsername}
        />
      )}

      {/* Draft claim sheet — desired username + 6-digit PIN, then Stripe. */}
      {draftClaimOpen && isDraft && (
        <DraftClaimForm
          draftSlug={footprint.username}
          onClose={() => setDraftClaimOpen(false)}
        />
      )}

      {giftModalOpen && isOwner && !isDraft && giftsRemaining !== null && (
        <GiftModal
          slug={footprint.username}
          giftsRemaining={giftsRemaining}
          onGiftSent={(remaining) => setGiftsRemaining(remaining)}
          onClose={() => setGiftModalOpen(false)}
        />
      )}
    </div>
  )
}
