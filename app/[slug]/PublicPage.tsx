'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Image from 'next/image'
import UnifiedTile from '@/components/UnifiedTile'
import SAspectShell from '@/components/SAspectShell'

import WeatherEffect from '@/components/WeatherEffect'
import { RemoveBubble } from '@/components/RemoveBubble'
import FloatingCtaBar from '@/components/FloatingCtaBar'
import SovereignTile from '@/components/SovereignTile'
import ClaimPlaque from '@/components/ClaimPlaque'
import DraftClaimForm from '@/components/DraftClaimForm'
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
import { getGridClass, resolveAspect, isVideoTile } from '@/lib/media/aspect'
import { getFootprintDisplayTitle } from '@/lib/footprint'
import { getRoomAtmosphere, DEFAULT_FILTER, DEFAULT_OVERLAY } from '@/lib/roomAtmosphere'
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
import { useDroppable } from '@dnd-kit/core'
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
  const { filter: wallpaperFilter, overlay: overlayColor } = isGrid
    ? { filter: DEFAULT_FILTER, overlay: DEFAULT_OVERLAY }
    : getRoomAtmosphere(activeRoomIndex, isSoundRoom)

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
        Object.prototype.hasOwnProperty.call(patch, 'room_id') &&
        (patch.room_id || null) !== (activeRoomId || null)
      ) {
        return prev.filter((t) => t.id !== id)
      }
      return prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    })
  }, [activeRoomId])

  // Remix — randomise size AND aspect for every tile in the active room.
  // Sizes: equal weight across S/M/L for maximum spread.
  // Aspects: randomised for image/video/thought/link tiles; embed tiles
  // (youtube, spotify, vimeo, soundcloud) keep their content-native aspect.
  const handleRemix = useCallback(() => {
    if (!localContent.length) return
    const sizes: (1 | 2 | 3)[] = [1, 2, 3]
    const aspects = ['square', 'wide', 'tall'] as const
    const embedTypes = new Set(['youtube', 'vimeo', 'spotify', 'soundcloud'])
    const picks = localContent.map((tile) => {
      const isEmbed = embedTypes.has(tile.type)
      return {
        id: tile.id,
        size: sizes[Math.floor(Math.random() * sizes.length)],
        aspect: isEmbed ? tile.aspect : aspects[Math.floor(Math.random() * aspects.length)],
        source: tileSources[tile.id] || (tile.type === 'image' || tile.type === 'video' ? 'library' : 'links'),
      }
    })
    setLocalContent((prev) =>
      prev.map((t) => {
        const p = picks.find((x) => x.id === t.id)
        return p ? { ...t, size: p.size, aspect: p.aspect } : t
      })
    )
    Promise.all(
      picks.map(({ id, size, aspect, source }) =>
        fetch('/api/tiles', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, size, aspect, source, slug: footprint.username }),
        })
      )
    ).catch((e) => console.error('remix PATCH failed', e))
  }, [localContent, tileSources, footprint.username])

  const handleTileDelete = useCallback((id: string) => {
    setLocalContent((prev) => prev.filter((t) => t.id !== id))
    setTileSources((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

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
    if (!window.confirm('delete this room? Tiles in it will return to the home view.')) return
    setRoomsLocal((prev) => prev.filter((r) => r.id !== roomId))
    if (activeRoomId === roomId) {
      const next = roomsLocal.find((r) => r.id !== roomId)
      setActiveRoomId(next?.id || null)
    }
    fetch(`/api/rooms?id=${encodeURIComponent(roomId)}&slug=${encodeURIComponent(footprint.username)}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch((e) => console.error('room delete failed', e))
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
      try { resized = await resizeImage(file, 2400) } catch { resized = file }
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

    // Drop-on-room — relocate the tile to that room. Active is the
    // tile id, over.id matches a room droppable id (prefixed below).
    const overId = String(over.id)
    if (overId.startsWith('room:')) {
      const targetRoomId = overId.slice('room:'.length)
      const tileId = String(active.id)
      const source = tileSources[tileId] || 'library'
      // Optimistic — remove from current room's localContent (it'll
      // reappear when the user navigates to the target room).
      setLocalContent((prev) => prev.filter((t) => t.id !== tileId))
      fetch('/api/tiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tileId, source, slug: footprint.username, room_id: targetRoomId }),
      }).catch((e) => console.error('Failed to assign room:', e))
      return
    }

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

  function handleChildMove(idx: number, dir: -1 | 1) {
    const next = moveChild(localChildren, idx, dir)
    if (next === localChildren) return
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

  // Per-pill render: wraps the pill in `useDroppable` when isOwner so
  // it can receive a drop from a tile drag (the send-to-room gesture).
  // Stranger render skips the droppable wiring entirely.
  function RoomPillNode({ room }: { room: any }) {
    const isActive = activeRoomId === room.id
    const isOpen = isOwner && editorMode && pillMenuOpenForId === room.id
    const { setNodeRef, isOver } = useDroppable({ id: `room:${room.id}`, disabled: !isOwner || !draggingTileId })
    return (
      <div
        ref={isOwner ? setNodeRef : undefined}
        className="relative flex items-center"
        style={isOver ? { background: 'rgba(255,255,255,0.06)', borderRadius: 4, transition: 'background 120ms ease' } : undefined}
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

  // Sortable tile wrapper for owner drag
  function SortableTileWrapper({ item, idx, children, className, style: extraStyle, disabled }: { item: any; idx: number; children: React.ReactNode; className?: string; style?: React.CSSProperties; disabled?: boolean }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled })
    // The dragged tile lifts (scale + shadow) instead of fading. The
    // previous opacity:0.4 read as "disappeared" — especially on video
    // posters which are already dark. Other tiles in the grid animate
    // out of the way via dnd-kit's transition; this wrapper just makes
    // the moving tile feel like it's floating above them.
    const baseTransform = CSS.Transform.toString(transform) || ''
    const style: React.CSSProperties = {
      transform: isDragging ? `${baseTransform} scale(1.04)` : baseTransform,
      transition: transition || 'transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1)',
      ...(isDragging ? {
        zIndex: 50,
        boxShadow: '0 18px 48px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.35)',
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
    // Explicit user shape always wins. The previous provider-first
    // ordering made old embed/video tiles ignore shape changes in the
    // editor because YouTube/Vimeo/SoundCloud forced 16:9 forever.
    if (item.aspect === 'square' || item.aspect === 'wide' || item.aspect === 'tall') {
      return tileAspectRatio(item.aspect)
    }
    const isEmbedVid = item.type === 'youtube' || item.type === 'vimeo' ||
      item.url?.includes('youtube') || item.url?.includes('youtu.be')
    if (isEmbedVid) return '16 / 9'
    if (item.type === 'spotify') return '9 / 16'
    if (item.type === 'soundcloud') return '16 / 9'
    const resolved = resolveAspect(item.aspect, item.type, item.url)
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
        </div>
        {/* Editor-mode click interceptor — opens the tile sheet on tap. */}
        {isOwner && editorMode && !expanded && (
          <div
            className="absolute inset-0 z-20 cursor-pointer"
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
    const gridClass = getGridClass(Number(item.size || 1), resolved, isVideoTile(item.type, item.url))
    const tileBody = renderTileBody(item, idx)
    const wrapperClass = `relative overflow-hidden rounded-2xl ${gridClass}`
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

  let gridInner: React.ReactNode
  if (isHorizontal) {
    // ── HORIZONTAL: cinematic rail. Each tile is its native aspect at a
    // fixed rail height, so widescreen reads as wide, vertical reads as
    // tall, square reads as square. Width derives. ──
    gridInner = (
      <div
        className={layoutConfig.containerClass}
        style={{
          scrollSnapType: 'x mandatory',
          scrollPaddingLeft: 'max(24px, calc((100vw - min(88vw, 620px)) / 2))',
          WebkitOverflowScrolling: 'touch' as any,
          paddingLeft: 'max(24px, calc((100vw - min(88vw, 620px)) / 2))',
          paddingRight: 'max(24px, calc((100vw - min(88vw, 620px)) / 2))',
          ...fadeStyle,
        }}
      >
        {displayContent.map((item: any, idx: number) => {
          const aspectCss = tileAspectCss(item)
          const size = Number(item.size || 1)
          const railHeight = size >= 3
            ? (isMobile ? 'min(78vh, 600px)' : 'min(76vh, 700px)')
            : size <= 1
              ? (isMobile ? 'min(58vh, 420px)' : 'min(54vh, 500px)')
              : (isMobile ? 'min(72vh, 540px)' : 'min(70vh, 640px)')
          const wrapperStyle: React.CSSProperties = {
            height: railHeight,
            aspectRatio: aspectCss,
          }
          const wrapperClass = layoutConfig.tileClass
          const body = renderTileBody(item, idx)
          if (isOwner) {
            return (
              <SortableTileWrapper key={item.id} item={item} idx={idx} className={wrapperClass} style={wrapperStyle} disabled={!!expanded}>
                {body}
              </SortableTileWrapper>
            )
          }
          return (
            <div key={item.id} className={wrapperClass} style={wrapperStyle}>
              {body}
            </div>
          )
        })}
      </div>
    )
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
        <div key={wallpaperUrlLocal} className="fixed inset-0 z-0 fp-wallpaper-gpu">
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
      {!isDraft && isOwner && !expanded && (
        <button
          type="button"
          aria-label={editorMode ? 'done editing' : 'edit page'}
          aria-pressed={editorMode}
          onClick={() => setEditorMode((v) => !v)}
          className="fixed z-30 touch-manipulation font-mono"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
            right: '16px',
            background: 'rgba(0,0,0,0.62)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.92)',
            borderRadius: 999,
            padding: '8px 16px',
            fontSize: 12,
            letterSpacing: '0.06em',
            textTransform: 'lowercase',
            cursor: 'pointer',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {editorMode ? 'done' : 'edit'}
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
              className="fixed inset-0 z-40"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                opacity: expanded ? 1 : 0,
                transition: 'opacity 0.4s ease',
                willChange: 'opacity',
              }}
              onClick={collapse}
              onTouchStart={(e) => { depthTouchStart.current = e.touches[0].clientY }}
              onTouchEnd={(e) => { if (e.changedTouches[0].clientY - depthTouchStart.current > 60) collapse() }}
            />
            {/* Expanded container viewport: header bar + horizontal child rail */}
            {expanded && (
              <div
                className="fixed inset-0 z-[55] flex flex-col pointer-events-none"
                style={{ opacity: loadingChildren ? 0 : 1, transition: 'opacity 0.3s ease 0.3s' }}
              >
                {/* Header bar — container label left, close X right */}
                <div
                  className="pointer-events-auto flex items-center justify-between px-5 flex-shrink-0"
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
                <div className="flex-1 flex items-center pointer-events-auto" style={{ padding: '12px 0' }}>
                  {localChildren.length > 0 ? (
                    <div
                      className="flex flex-row overflow-x-auto gap-4 hide-scrollbar w-full h-full items-center"
                      style={{
                        scrollSnapType: 'x mandatory',
                        WebkitOverflowScrolling: 'touch' as any,
                        paddingLeft: 'max(16px, calc((100vw - min(88vw, 620px)) / 2))',
                        paddingRight: 'max(16px, calc((100vw - min(88vw, 620px)) / 2))',
                        scrollPaddingLeft: 'max(16px, calc((100vw - min(88vw, 620px)) / 2))',
                      }}
                    >
                      {localChildren.map((child: any, idx: number) => (
                        <div
                          key={child.id}
                          className="flex-shrink-0 snap-center relative overflow-hidden rounded-2xl"
                          style={{
                            width: 'min(85vw, 580px)',
                            height: '75%',
                            minHeight: '300px',
                            ...glassStyle,
                            borderRadius: '16px',
                          }}
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
                            aspect={child.aspect || 'square'}
                            mode="public"
                            layout="rail"
                            isMobile={isMobile}
                          />
                          {/* Owner-only controls — delete + reorder */}
                          {isOwner && (
                            <div className="absolute inset-0 z-10 pointer-events-none">
                              <button
                                className="absolute top-2 right-2 pointer-events-auto w-7 h-7 flex items-center justify-center rounded-full touch-manipulation transition-colors hover:bg-red-500/30"
                                style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}
                                onClick={() => handleChildDelete(child)}
                                aria-label="Remove item"
                              >
                                <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-auto">
                                <button
                                  className="w-7 h-7 flex items-center justify-center rounded-full touch-manipulation transition-opacity"
                                  style={{
                                    background: 'rgba(0,0,0,0.55)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    opacity: idx === 0 ? 0.3 : 1,
                                    cursor: idx === 0 ? 'default' : 'pointer',
                                  }}
                                  onClick={() => handleChildMove(idx, -1)}
                                  disabled={idx === 0}
                                  aria-label="Move left"
                                >
                                  <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                  </svg>
                                </button>
                                <button
                                  className="w-7 h-7 flex items-center justify-center rounded-full touch-manipulation transition-opacity"
                                  style={{
                                    background: 'rgba(0,0,0,0.55)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    opacity: idx === localChildren.length - 1 ? 0.3 : 1,
                                    cursor: idx === localChildren.length - 1 ? 'default' : 'pointer',
                                  }}
                                  onClick={() => handleChildMove(idx, 1)}
                                  disabled={idx === localChildren.length - 1}
                                  aria-label="Move right"
                                >
                                  <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : !loadingChildren ? (
                    <div className="flex items-center justify-center w-full py-12">
                      <span className="text-white/20 font-mono text-xs tracking-widest uppercase">empty</span>
                    </div>
                  ) : null}
                </div>

                {/* Owner-only add URL footer */}
                {isOwner && (
                  <div
                    className="pointer-events-auto flex-shrink-0 flex items-center gap-2 px-4 py-3"
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

      {/* Serial number — fixed bottom-left, tappable for visitors */}
      {!isDraft && serial && !claimActive && (
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

      {/* Return affordance — quiet doorway. Routes to /{slug}?edit=1
          where EditAccessScreen surfaces as a full-page overlay for the
          email + 6-digit code flow. Server-side hint suppresses this
          for owners on first paint (no flash). */}
      {!isOwnerHinted && !isDraft && (
        <a
          href={`/${footprint.username}?edit=1`}
          className="fixed bottom-4 right-4 z-20 font-mono text-[11px] text-white/[0.15] hover:text-white/40 transition-colors duration-300 px-2 py-1 select-none touch-manipulation"
        >
          return
        </a>
      )}

      {/* Floating CTA bar — viewers only, hidden for owner and during claim */}
      {!isDraft && !claimActive && authChecked && !isOwner && (
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
    </div>
  )
}
