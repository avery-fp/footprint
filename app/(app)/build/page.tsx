'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { saveDraft, loadDraft, DraftContent, DraftFootprint } from '@/lib/draft-store'
import { resolveMediaSync } from '@/lib/media/resolveMedia'
import { extractYouTubeId, getYouTubeThumbnail } from '@/lib/parseEmbed'
import { isVideoFile } from '@/lib/upload'
import SandboxSortableGrid from '@/components/SandboxSortableGrid'
import AddTileSheet from '@/components/AddTileSheet'
import OAuthButton from '@/components/auth/OAuthButton'
import Divider from '@/components/auth/Divider'

const SANDBOX_SLUG = '_sandbox'
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

// ─── Sign-in modal with inline OAuth ───
function SignInModal({ onClose }: { onClose: () => void }) {
  // Set redirect cookie so OAuth returns to /build
  useEffect(() => {
    document.cookie = 'post_auth_redirect=/build; path=/; max-age=600; samesite=lax'
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-8 pt-10 text-center border border-white/[0.08] border-b-0 sm:border-b"
        style={{ background: '#0a0a0a' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-8 h-0.5 bg-white/20 rounded-full mx-auto mb-8 sm:hidden" />
        <h2 className="text-lg font-light text-white/80 mb-6 tracking-wide">
          sign in to publish
        </h2>

        {/* OAuth buttons */}
        <div className="flex flex-col gap-3 mb-4">
          <OAuthButton provider="google" label="continue with Google" />
          <OAuthButton provider="apple" label="continue with Apple" />
        </div>

        <Divider />

        {/* Email fallback */}
        <a
          href={`/login?redirect=${encodeURIComponent('/build')}`}
          className="block w-full py-3 rounded-xl text-[13px] font-mono text-white/40 hover:text-white/60 transition-all mt-4"
        >
          sign in with email
        </a>

        <button
          onClick={onClose}
          className="mt-4 text-white/20 text-[11px] hover:text-white/40 transition-colors"
        >
          keep building
        </button>
      </div>
    </div>
  )
}

// ─── Empty state ───
function EmptyCanvas({ onTap, onDrop }: { onTap: () => void; onDrop: (files: File[]) => void }) {
  const [dragOver, setDragOver] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(window.innerWidth < 640)
  }, [])

  return (
    <button
      onClick={onTap}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) onDrop(files)
      }}
      className={`
        w-full aspect-[3/4] sm:aspect-[4/3] max-w-md mx-auto
        rounded-3xl
        bg-white/[0.02] hover:bg-white/[0.04]
        border border-dashed
        ${dragOver ? 'border-white/[0.25] bg-white/[0.06]' : 'border-white/[0.08] hover:border-white/[0.15]'}
        backdrop-blur-sm
        transition-all duration-500 ease-out
        flex flex-col items-center justify-center gap-4
        cursor-pointer group active:scale-[0.98]
      `}
    >
      <div className="
        w-16 h-16 rounded-2xl
        bg-white/[0.04] group-hover:bg-white/[0.08]
        border border-white/[0.08] group-hover:border-white/[0.15]
        flex items-center justify-center
        transition-all duration-500 backdrop-blur-sm
      ">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white/30 group-hover:text-white/50 transition-colors duration-500">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-white/20 group-hover:text-white/35 text-[12px] font-mono tracking-widest transition-colors duration-500">
        {isMobile ? 'tap to add' : 'drop files or tap to add'}
      </span>
    </button>
  )
}

// ═══════════════════════════════════════════
// BUILD PAGE — sandbox editor
// ═══════════════════════════════════════════
export default function BuildPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [isAuth, setIsAuth] = useState(false)
  const [tiles, setTiles] = useState<DraftContent[]>([])
  const [showSignIn, setShowSignIn] = useState(false)
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [dragOverPage, setDragOverPage] = useState(false)

  // In-memory file map for object URL previews (not persisted)
  const fileMapRef = useRef<Map<string, string>>(new Map())
  // Undo buffer for tile deletion
  const undoRef = useRef<{ tile: DraftContent; index: number; timeout: ReturnType<typeof setTimeout> } | null>(null)

  // ── Auth check — redirect logged-in users to their editor ──
  useEffect(() => {
    async function checkAuth() {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000)
        const fpRes = await fetch('/api/footprint-for-user', { signal: controller.signal })
        clearTimeout(timeout)
        if (fpRes.ok) {
          const data = await fpRes.json()
          if (data.slug) {
            const sandboxDraft = loadDraft(SANDBOX_SLUG)
            if (sandboxDraft && sandboxDraft.content.length > 0) {
              try {
                localStorage.setItem('fp:sandbox-transfer', JSON.stringify(sandboxDraft.content))
              } catch {}
            }
            setIsAuth(true)
            router.push(`/${data.slug}/home`)
            return
          }
        }
      } catch {}
      setAuthChecked(true)
    }
    checkAuth()
  }, [router])

  // ── Load existing sandbox draft ──
  useEffect(() => {
    if (!authChecked) return
    const draft = loadDraft(SANDBOX_SLUG)
    if (draft && draft.content.length > 0) {
      setTiles(draft.content)
    }
  }, [authChecked])

  // ── Persist tiles to localStorage (strip object URLs) ──
  useEffect(() => {
    if (!authChecked || isAuth) return
    // Filter out blob: URLs from persisted data — they won't survive reload
    const persistable = tiles.map((t) => ({
      ...t,
      url: t.url.startsWith('blob:') ? '' : t.url,
    }))
    const draft: DraftFootprint = {
      slug: SANDBOX_SLUG,
      display_name: '',
      handle: '',
      bio: '',
      theme: 'midnight',
      grid_mode: 'grid',
      avatar_url: null,
      content: persistable,
      updated_at: Date.now(),
    }
    saveDraft(SANDBOX_SLUG, draft)
  }, [tiles, authChecked, isAuth])

  // ── Escape key handler ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (addSheetOpen) setAddSheetOpen(false)
        else if (showSignIn) setShowSignIn(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [addSheetOpen, showSignIn])

  // ── Tile ID generator ──
  const genId = useCallback((prefix: string) => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }, [])

  // ── Add URL tile (from AddTileSheet) ──
  const handleAddUrl = useCallback(
    (url: string) => {
      const tileId = genId('sandbox-url')

      // Use resolveMediaSync for instant platform detection
      const resolved = resolveMediaSync(url)
      if (resolved) {
        const newTile: DraftContent = {
          id: tileId,
          url: resolved.canonicalUrl,
          type: resolved.type,
          title: resolved.title,
          description: resolved.description,
          thumbnail_url: resolved.previewImage,
          embed_html: null,
          position: tiles.length,
        }
        // For YouTube, store the video ID as url for thumbnail rendering
        if (resolved.type === 'youtube' && resolved.externalId) {
          newTile.url = resolved.externalId
          newTile.thumbnail_url = resolved.previewImage || `https://img.youtube.com/vi/${resolved.externalId}/hqdefault.jpg`
        }
        setTiles((prev) => [...prev, newTile])
        toast('added')
        return
      }

      // Fallback: generic link
      const newTile: DraftContent = {
        id: tileId,
        url: url.startsWith('http') ? url : `https://${url}`,
        type: 'link',
        title: url,
        description: null,
        thumbnail_url: null,
        embed_html: null,
        position: tiles.length,
      }
      setTiles((prev) => [...prev, newTile])
      toast('added')
    },
    [tiles.length, genId]
  )

  // ── Add files (from AddTileSheet or drag-and-drop) ──
  const handleAddFiles = useCallback(
    (files: File[]) => {
      const oversized = files.filter((f) => f.size > MAX_FILE_SIZE)
      if (oversized.length > 0) {
        toast.error('file too large — 50MB max')
        return
      }

      const newTiles: DraftContent[] = files.map((file, idx) => {
        const tileId = genId('sandbox-file')
        const objectUrl = URL.createObjectURL(file)
        fileMapRef.current.set(tileId, objectUrl)

        return {
          id: tileId,
          url: objectUrl,
          type: isVideoFile(file) ? 'video' : 'image',
          title: file.name,
          description: null,
          thumbnail_url: null,
          embed_html: null,
          position: tiles.length + idx,
        }
      })

      setTiles((prev) => [...prev, ...newTiles])
      if (newTiles.length > 0) toast('added')
    },
    [tiles.length, genId]
  )

  // ── Add thought tile ──
  const handleAddThought = useCallback(
    (text: string) => {
      const tileId = genId('sandbox-thought')
      const newTile: DraftContent = {
        id: tileId,
        url: '',
        type: 'thought',
        title: text,
        description: null,
        thumbnail_url: null,
        embed_html: null,
        position: tiles.length,
      }
      setTiles((prev) => [...prev, newTile])
      toast('added')
    },
    [tiles.length, genId]
  )

  // ── Remove tile with undo ──
  const removeTile = useCallback((id: string) => {
    // Cancel any pending undo
    if (undoRef.current) {
      clearTimeout(undoRef.current.timeout)
      undoRef.current = null
    }

    setTiles((prev) => {
      const index = prev.findIndex((t) => t.id === id)
      if (index === -1) return prev

      const tile = prev[index]
      const next = prev.filter((t) => t.id !== id)

      // Set up undo buffer
      const timeout = setTimeout(() => {
        // Revoke object URL if it was a local file
        const objectUrl = fileMapRef.current.get(id)
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl)
          fileMapRef.current.delete(id)
        }
        undoRef.current = null
      }, 4000)

      undoRef.current = { tile, index, timeout }

      toast('removed', {
        action: {
          label: 'undo',
          onClick: () => {
            if (undoRef.current) {
              clearTimeout(undoRef.current.timeout)
              const { tile: restored, index: idx } = undoRef.current
              setTiles((curr) => {
                const copy = [...curr]
                copy.splice(Math.min(idx, copy.length), 0, restored)
                return copy.map((t, i) => ({ ...t, position: i }))
              })
              undoRef.current = null
            }
          },
        },
      })

      return next.map((t, i) => ({ ...t, position: i }))
    })
  }, [])

  // ── Reorder tiles ──
  const handleReorder = useCallback((reordered: DraftContent[]) => {
    setTiles(reordered)
  }, [])

  // ── Page-level drag-and-drop ──
  const handlePageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOverPage(true)
  }, [])

  const handlePageDragLeave = useCallback(() => {
    setDragOverPage(false)
  }, [])

  const handlePageDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOverPage(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) handleAddFiles(files)
    },
    [handleAddFiles]
  )

  // ── Loading state ──
  if (!authChecked) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: '#050505' }}>
        <div className="w-5 h-5 border border-white/10 border-t-white/30 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div
      className="min-h-[100dvh] relative flex flex-col"
      style={{ background: '#050505' }}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {/* Dot grid background */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Breathing gradient */}
      <div
        className="fixed inset-0 pointer-events-none z-0 animate-breathe"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 40%, rgba(255,255,255,0.02) 0%, transparent 70%)',
        }}
      />

      {/* Drag-over indicator */}
      {dragOverPage && tiles.length > 0 && (
        <div className="fixed inset-0 z-30 pointer-events-none border-2 border-dashed border-white/20 rounded-xl m-4 transition-all" />
      )}

      {/* Header */}
      <div
        className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
      >
        <a
          href="/"
          className="text-white/25 text-[10px] font-mono tracking-[0.2em] uppercase hover:text-white/40 transition-colors"
        >
          footprint
        </a>
        <button
          onClick={() => setShowSignIn(true)}
          className="
            text-[12px] text-white/50 hover:text-white/80 transition-all font-mono
            px-4 py-1.5 rounded-xl
            bg-white/[0.04] hover:bg-white/[0.08]
            border border-white/[0.08] hover:border-white/[0.15]
            backdrop-blur-sm
          "
        >
          sign up to publish
        </button>
      </div>

      {/* Main canvas */}
      <div className="flex-1 pt-16 pb-24 px-3 relative z-10">
        <div className="mx-auto w-full" style={{ maxWidth: '640px' }}>
          {/* Empty state */}
          {tiles.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60dvh]">
              <EmptyCanvas
                onTap={() => setAddSheetOpen(true)}
                onDrop={handleAddFiles}
              />
            </div>
          )}

          {/* Tile grid */}
          {tiles.length > 0 && (
            <SandboxSortableGrid
              tiles={tiles}
              onReorder={handleReorder}
              onRemove={removeTile}
              onAddTap={() => setAddSheetOpen(true)}
            />
          )}
        </div>
      </div>

      {/* AddTileSheet — replaces inline paste input */}
      <AddTileSheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        onAddUrl={handleAddUrl}
        onAddFiles={handleAddFiles}
        onAddThought={handleAddThought}
      />

      {/* Sign-in modal */}
      {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
    </div>
  )
}
