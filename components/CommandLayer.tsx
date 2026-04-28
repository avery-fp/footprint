'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { applyNextThumbnailFallback, applyThumbnailLoadGuard, getThumbnailCandidates } from '@/lib/media/thumbnails'
import { useRolodex } from '@/store/useRolodex'

interface Room {
  id: string
  name: string
  content: any[]
}

interface CommandLayerProps {
  content: any[]
  rooms: Room[]
  footprint: { display_name: string; username: string }
  theme: any
  isMobile: boolean
  isOwner: boolean
  activeRoomId: string | null
  onNavigateToTile: (tileId: string, roomId: string) => void
  onNavigateToRoom: (roomId: string | null) => void
}

interface SearchResult {
  item: any
  roomName: string | null
  score: number
}

interface PersonResult {
  username: string
  display_name: string | null
}

function getDisplayTitle(item: any): string {
  if (item.title) return item.title
  if (item.caption) return item.caption
  if (item.artist) return item.artist
  if (item.type === 'thought') return 'thought'
  if (item.type) return item.type
  if (item.url) {
    try { return new URL(item.url).hostname.replace('www.', '') }
    catch { return 'link' }
  }
  return 'untitled'
}

function getTypeLabel(item: any): string {
  if (item.type === 'thought') return 'thought'
  if (item.type === 'youtube') return 'youtube'
  if (item.type === 'spotify') return 'spotify'
  if (item.type === 'twitter') return 'tweet'
  if (item.type === 'instagram') return 'ig'
  if (item.type === 'tiktok') return 'tiktok'
  if (item.type === 'soundcloud') return 'soundcloud'
  if (item.type === 'vimeo') return 'vimeo'
  if (item.type === 'video') return 'video'
  if (item.type === 'image') return 'image'
  if (item.type === 'link') return 'link'
  return item.type || 'tile'
}

export default function CommandLayer({
  content,
  rooms,
  footprint,
  theme,
  isMobile,
  isOwner,
  activeRoomId,
  onNavigateToTile,
  onNavigateToRoom,
}: CommandLayerProps) {
  const [open, setOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const peopleInputRef = useRef<HTMLInputElement>(null)
  const reducedMotion = useReducedMotion()
  const { command } = MOTION
  const { slugs, loaded: rolodexLoaded, hydrate: hydrateRolodex, has, add } = useRolodex()

  // People search
  const [peopleQuery, setPeopleQuery] = useState('')
  const [peopleResults, setPeopleResults] = useState<PersonResult[]>([])
  const peopleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentSlug = footprint.username
  const currentSaved = rolodexLoaded && has(currentSlug)

  useEffect(() => { hydrateRolodex() }, [hydrateRolodex])

  useEffect(() => {
    const q = peopleQuery.trim()
    if (!q) {
      setPeopleResults([])
      return
    }
    if (peopleDebounceRef.current) clearTimeout(peopleDebounceRef.current)
    peopleDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/footprints?q=${encodeURIComponent(q)}`)
        if (res.ok) {
          const data = await res.json()
          setPeopleResults(data.results || [])
        }
      } catch {}
    }, 220)
    return () => {
      if (peopleDebounceRef.current) clearTimeout(peopleDebounceRef.current)
    }
  }, [peopleQuery])

  // Room name lookup
  const roomNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const room of rooms) {
      map.set(room.id, room.name)
    }
    return map
  }, [rooms])

  // Search
  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const terms = q.split(/\s+/)

    const scored: SearchResult[] = []
    for (const item of content) {
      const blob = [
        item.title,
        item.caption,
        item.artist,
        item.description,
        item.metadata?.description,
        item.type,
        item.url,
        item.room_id ? roomNameMap.get(item.room_id) : null,
      ].filter(Boolean).join(' ').toLowerCase()

      let score = 0
      for (const term of terms) {
        if (blob.includes(term)) score++
      }
      if (score === 0) continue

      scored.push({
        item,
        roomName: item.room_id ? roomNameMap.get(item.room_id) || null : null,
        score,
      })
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (a.item.position ?? 999) - (b.item.position ?? 999)
    })

    return scored.slice(0, 20)
  }, [query, content, roomNameMap])

  const quickRooms = useMemo(
    () => [
      { id: null as string | null, name: 'all', count: content.length },
      ...rooms.map(room => ({
        id: room.id,
        name: room.name,
        count: room.content.length,
      })),
    ],
    [content.length, rooms]
  )

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

  useEffect(() => {
    if (!peopleOpen) setPeopleQuery('')
  }, [peopleOpen])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results.length])

  // Auto-focus input
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (peopleOpen) {
      requestAnimationFrame(() => peopleInputRef.current?.focus())
    }
  }, [peopleOpen])

  // Global keyboard: `/` to open, Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '/' && !open) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
      if (e.key === 'Escape' && peopleOpen) {
        setPeopleOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, peopleOpen])

  const handlePeopleOpen = useCallback(async () => {
    setPeopleOpen(true)
    if (!isOwner && currentSlug && !currentSaved) {
      await add(currentSlug)
    }
  }, [add, currentSaved, currentSlug, isOwner])

  // Group results by room + stable flat indices (computed in useMemo, not mutated during render)
  const { groups, flatResults } = useMemo(() => {
    const groups: { roomName: string | null; items: { result: SearchResult; flatIndex: number }[] }[] = []
    const flatResults: SearchResult[] = []
    const seen = new Map<string | null, number>()
    let idx = 0
    for (const r of results) {
      const key = r.roomName
      const entry = { result: r, flatIndex: idx++ }
      flatResults.push(r)
      if (seen.has(key)) {
        groups[seen.get(key)!].items.push(entry)
      } else {
        seen.set(key, groups.length)
        groups.push({ roomName: key, items: [entry] })
      }
    }
    return { groups, flatResults }
  }, [results])

  // Panel keyboard: arrows, enter
  const handlePanelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flatResults.length > 0) {
      e.preventDefault()
      const result = flatResults[selectedIndex]
      if (result) {
        onNavigateToTile(result.item.id, result.item.room_id || activeRoomId || '')
        setTimeout(() => setOpen(false), 150)
      }
    }
  }, [flatResults, selectedIndex, onNavigateToTile, activeRoomId])

  return (
    <>
      {/* People memory — system layer */}
      <div className="fixed left-4 top-4 z-40 md:left-6 md:top-5">
        <button
          type="button"
          onClick={handlePeopleOpen}
          aria-label={currentSaved ? 'Open people' : 'Remember this place'}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] leading-none text-white/28 outline-none transition-colors duration-200 hover:text-white/55 focus-visible:ring-2 focus-visible:ring-white/20"
          style={{
            background: 'transparent',
            fontWeight: 300,
          }}
        >
          +
        </button>
      </div>

      <AnimatePresence>
        {peopleOpen && (
          <>
            <motion.div
              key="people-layer-backdrop"
              className="fixed inset-0 z-[55]"
              style={{
                background:
                  'radial-gradient(circle at 18% 22%, rgba(255,255,255,0.035), transparent 30%), rgba(0,0,0,0.12)',
                backdropFilter: 'blur(7px) saturate(108%)',
                WebkitBackdropFilter: 'blur(7px) saturate(108%)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.18 } }}
              exit={{ opacity: 0, transition: { duration: 0.14 } }}
              onClick={() => setPeopleOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              key="people-layer-sheet"
              role="dialog"
              aria-label="People"
              aria-modal="true"
              className="fixed z-[56]"
              style={{
                left: 'clamp(24px, 9vw, 128px)',
                top: 'clamp(86px, 18vh, 150px)',
                width: 'min(430px, calc(100vw - 48px))',
              }}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4, transition: { duration: 0.12 } }}
            >
              <input
                ref={peopleInputRef}
                type="text"
                value={peopleQuery}
                onChange={e => setPeopleQuery(e.target.value)}
                placeholder="name, @handle, or #number"
                className="w-full appearance-none rounded-none bg-transparent border-0 border-b border-white/[0.075] px-0 pb-2 pt-1 font-mono text-[12px] text-white/48 placeholder:text-white/18 outline-none ring-0 transition-colors duration-200 focus:border-white/[0.16] focus:text-white/62 focus:outline-none focus:ring-0"
                style={{ outline: 'none', boxShadow: 'none' }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />

              {peopleQuery.trim() && (
                <div className="mt-5 flex flex-col gap-2">
                  {peopleResults.length === 0 ? (
                    <div className="font-mono text-[12px] text-white/18">nothing</div>
                  ) : (
                    peopleResults.map(r => (
                      <a
                        key={r.username}
                        href={`/${r.username}`}
                        onClick={() => setPeopleOpen(false)}
                        className="group flex flex-col py-1"
                        style={{ textDecoration: 'none' }}
                      >
                        <span className="truncate font-mono text-[13px] text-white/58 transition-colors duration-200 group-hover:text-white/82">
                          {r.display_name || r.username}
                        </span>
                        <span className="font-mono text-[11px] text-white/24 transition-colors duration-200 group-hover:text-white/38">
                          /{r.username}
                        </span>
                      </a>
                    ))
                  )}
                </div>
              )}

              <div className="mt-8">
                <div className="mb-4 font-mono text-[10px] lowercase tracking-[0.24em] text-white/30">
                  saved
                </div>
                {rolodexLoaded && slugs.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {slugs.map(slug => (
                      <a
                        key={slug}
                        href={`/${slug}`}
                        onClick={() => setPeopleOpen(false)}
                        className="font-mono text-[15px] text-white/62 transition-colors duration-200 hover:text-white/86"
                        style={{ textDecoration: 'none' }}
                      >
                        /{slug}
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="font-mono text-[14px] text-white/26">empty</div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Panel + backdrop */}
      <AnimatePresence>
        {open && !isMobile && (
          <>
            {/* Backdrop */}
            <motion.div
              key="command-backdrop"
              className="fixed inset-0 z-[45]"
              style={{ backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.4)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: command.duration } }}
              exit={{ opacity: 0, transition: { duration: command.exitDuration } }}
              onClick={() => setOpen(false)}
            />

            {/* Panel */}
            <motion.div
              key="command-panel"
              role="dialog"
              aria-label="Search your space"
              className="fixed left-4 z-[46] w-[380px] flex flex-col overflow-hidden"
              style={{
                top: '12%',
                maxHeight: '70vh',
                background: 'rgba(0,0,0,0.82)',
                backdropFilter: 'blur(40px)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                boxShadow: '0 16px 64px rgba(0,0,0,0.6)',
              }}
              initial={reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, x: -16, scale: 0.97 }
              }
              animate={reducedMotion
                ? { opacity: 1, transition: { duration: command.duration } }
                : { opacity: 1, x: 0, scale: 1, transition: { duration: command.duration, ease: command.easing } }
              }
              exit={reducedMotion
                ? { opacity: 0, transition: { duration: command.exitDuration } }
                : { opacity: 0, x: -8, transition: { duration: command.exitDuration } }
              }
              onKeyDown={handlePanelKeyDown}
            >
              {/* Input */}
              <div className="p-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="find rooms, tiles, links"
                  className="w-full bg-white/[0.04] border border-white/10 focus:border-white/20 rounded-xl px-4 py-3.5 text-[14px] text-white/80 placeholder:text-white/20 font-mono outline-none transition-colors duration-200"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Search"
                />
              </div>

              {/* Results */}
              {query.trim() && (
                <div
                  className="flex-1 overflow-y-auto overscroll-contain px-2 pb-3"
                  role="listbox"
                  aria-label="Search results"
                  style={{ maxHeight: 'calc(70vh - 80px)' }}
                >
                  {results.length === 0 ? (
                    <div className="text-white/15 text-[13px] font-mono text-center py-8">
                      nothing
                    </div>
                  ) : (
                    groups.map((group, gi) => (
                      <div key={gi}>
                        {/* Room header */}
                        {group.roomName && groups.length > 1 && (
                          <div className="text-[10px] text-white/20 uppercase tracking-[0.15em] font-mono px-3 pt-3 pb-1">
                            {group.roomName}
                          </div>
                        )}

                        {/* Result cards */}
                        {group.items.map((entry) => {
                          const { result, flatIndex } = entry
                          const isSelected = flatIndex === selectedIndex
                          const thumbCandidates = getThumbnailCandidates(result.item)
                          const thumb = thumbCandidates[0] || null

                          return (
                            <motion.button
                              key={result.item.id}
                              role="option"
                              aria-selected={isSelected}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors duration-150 text-left ${
                                isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                              }`}
                              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                              animate={{
                                opacity: 1,
                                y: 0,
                                transition: { delay: flatIndex * command.staggerDelay, duration: 0.2 },
                              }}
                              onClick={() => {
                                onNavigateToTile(result.item.id, result.item.room_id || activeRoomId || '')
                                setTimeout(() => setOpen(false), 150)
                              }}
                            >
                              {/* Thumbnail */}
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt=""
                                  className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                                  style={{ background: 'rgba(255,255,255,0.04)' }}
                                  onLoad={(e) => {
                                    applyThumbnailLoadGuard(e.currentTarget, thumbCandidates)
                                  }}
                                  onError={(e) => {
                                    applyNextThumbnailFallback(e.currentTarget, thumbCandidates)
                                  }}
                                />
                              ) : (
                                <div
                                  className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                                  style={{ background: 'rgba(255,255,255,0.04)' }}
                                >
                                  <span className="text-[10px] text-white/20 font-mono">
                                    {getTypeLabel(result.item).charAt(0)}
                                  </span>
                                </div>
                              )}

                              {/* Text */}
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] text-white/70 font-mono truncate">
                                  {getDisplayTitle(result.item)}
                                </div>
                                <div className="text-[10px] text-white/25 uppercase tracking-wider">
                                  {getTypeLabel(result.item)}
                                </div>
                              </div>
                            </motion.button>
                          )
                        })}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Hint — only when empty */}
              {!query.trim() && (
                <div className="px-3 pb-4 pt-1">
                  <div className="px-1 pb-3">
                    <div className="text-[10px] text-white/20 uppercase tracking-[0.18em] font-mono">
                      jump
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {quickRooms.map((room) => {
                      const isActive = room.id === activeRoomId || (room.id === null && activeRoomId === null)
                      return (
                        <button
                          key={room.id || 'all'}
                          onClick={() => {
                            onNavigateToRoom(room.id)
                            setTimeout(() => setOpen(false), 120)
                          }}
                          className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                            isActive ? 'bg-white/[0.08]' : 'bg-white/[0.03] hover:bg-white/[0.05]'
                          }`}
                        >
                          <span className="text-[13px] text-white/72 font-mono truncate">
                            {room.name}
                          </span>
                          <span className="text-[10px] text-white/22 font-mono">
                            {room.count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="px-1 pt-4 text-[11px] text-white/10 font-mono">
                    press <span className="text-white/20">/</span> to search every tile
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
