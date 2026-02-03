'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { nanoid } from 'nanoid'
import { parseURL } from '@/lib/parser'
import { loadDraft, saveDraft, clearDraft, DraftFootprint, DraftContent } from '@/lib/draft-store'
import ContentCard from '@/components/ContentCard'
import { getTheme } from '@/lib/themes'

// Extended content type that tracks source table for owners
interface TileContent extends DraftContent {
  source?: 'library' | 'links'
}

export default function PublicEditPage() {
  const params = useParams()
  const slug = params.slug as string

  const [draft, setDraft] = useState<DraftFootprint | null>(null)
  const [pasteUrl, setPasteUrl] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  // Context-awareness: track if user owns this slug
  const [isOwner, setIsOwner] = useState(false)
  const [isPublic, setIsPublic] = useState(true)
  const [isTogglingPublic, setIsTogglingPublic] = useState(false)

  // Grid mode: 'public' (tight), 'edit' (medium), 'spaced' (generous)
  const [gridMode, setGridMode] = useState<'public' | 'edit' | 'spaced'>('public')

  // Track tile sources for owners (needed for delete)
  const [tileSources, setTileSources] = useState<Record<string, 'library' | 'links'>>({})

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load data on mount - check ownership first
  useEffect(() => {
    async function loadData() {
      try {
        // Check if user owns this slug - ALWAYS fetch fresh data
        const res = await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
          cache: 'no-store',
          next: { revalidate: 0 },
          credentials: 'include',
        })
        const data = await res.json()

        if (data.owned && data.footprint) {
          // User owns this - load from DB
          setIsOwner(true)
          setIsPublic(data.footprint.published ?? true)

          // Load grid mode
          const mode = data.footprint.grid_mode || 'public'
          setGridMode(mode)

          // Map tiles to draft format and track sources
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
        } else {
          // Not owner - use localStorage
          setIsOwner(false)
          const existingDraft = loadDraft(slug)
          if (existingDraft) {
            setDraft(existingDraft)
            setGridMode(existingDraft.grid_mode || 'public')
          } else {
            setDraft({
              slug,
              display_name: '',
              handle: '',
              bio: '',
              theme: 'midnight',
              grid_mode: 'public',
              avatar_url: null,
              content: [],
              updated_at: Date.now(),
            })
          }
        }
      } catch (error) {
        // Network error - fallback to localStorage
        console.error('Failed to check ownership:', error)
        setIsOwner(false)
        const existingDraft = loadDraft(slug)
        if (existingDraft) {
          setDraft(existingDraft)
          setGridMode(existingDraft.grid_mode || 'public')
        } else {
          setDraft({
            slug,
            display_name: '',
            handle: '',
            bio: '',
            theme: 'midnight',
            grid_mode: 'public',
            avatar_url: null,
            content: [],
            updated_at: Date.now(),
          })
        }
      }
      setIsLoading(false)
    }

    loadData()
  }, [slug])

  // Save function - routes to DB or localStorage based on ownership
  // Note: For owners, profile changes auto-save to DB. Tiles use /api/tiles.
  const saveData = useCallback(async (d: DraftFootprint) => {
    if (!isOwner) {
      // Save to localStorage for drafts
      saveDraft(slug, d)
    } else {
      // Save owner profile to DB
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
    }
  }, [isOwner, slug])

  // Debounced auto-save on profile changes
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

  // Save before unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (draft && !isOwner) {
        saveDraft(slug, draft)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [draft, slug, isOwner])

  async function handleAddContent() {
    if (!pasteUrl.trim() || !draft) return
    setIsAdding(true)
    try {
      if (isOwner) {
        // Add to DB via tiles API (server derives serial_number from slug)
        const res = await fetch('/api/tiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            url: pasteUrl,
          }),
        })
        const data = await res.json()
        if (data.tile) {
          // Track the source
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
      } else {
        // Add to draft (localStorage)
        const parsed = await parseURL(pasteUrl)
        const newContent: DraftContent = {
          id: nanoid(),
          url: parsed.url,
          type: parsed.type,
          title: parsed.title,
          description: parsed.description,
          thumbnail_url: parsed.thumbnail_url,
          embed_html: parsed.embed_html,
          position: 0,
        }
        setDraft(prev => prev ? {
          ...prev,
          content: [newContent, ...prev.content.map((c, i) => ({ ...c, position: i + 1 }))],
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
    // Prevent duplicate deletes
    if (deletingIds.has(id)) return

    setDeletingIds(prev => new Set(prev).add(id))

    try {
      if (isOwner) {
        // Delete from DB via tiles API (server derives serial_number from slug)
        const source = tileSources[id]
        if (!source) {
          console.error('Delete failed: Unknown tile source for id', id)
          throw new Error('Unknown tile source')
        }

        console.log('Deleting tile:', { id, source, slug })

        const res = await fetch('/api/tiles', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, source, id }),
          credentials: 'include', // Ensure cookies are sent
        })

        if (!res.ok) {
          const error = await res.json()
          console.error('Delete API error:', error)
          throw new Error(error.error || `Delete failed with status ${res.status}`)
        }

        const result = await res.json()
        console.log('Delete successful:', result)
      }

      // Only update local state after successful server delete (or if draft mode)
      setDraft(prev => prev ? {
        ...prev,
        content: prev.content.filter(c => c.id !== id),
        updated_at: Date.now(),
      } : null)

      // Clean up source tracking
      setTileSources(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })

    } catch (error) {
      console.error('Failed to delete tile:', error)
      alert(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}. Check console for details.`)
      // Remove from deleting state so user can retry
      setDeletingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  function handleClearDraft() {
    if (isOwner) {
      // Owners can't clear - they edit their live page
      alert('This is your live page. Delete individual items instead.')
      return
    }
    if (confirm('Clear all draft content? This cannot be undone.')) {
      clearDraft(slug)
      setDraft({
        slug,
        display_name: '',
        handle: '',
        bio: '',
        theme: 'midnight',
        avatar_url: null,
        content: [],
        updated_at: Date.now(),
      })
    }
  }

  async function handleTogglePublic() {
    if (!isOwner || isTogglingPublic) return

    setIsTogglingPublic(true)
    const newValue = !isPublic

    try {
      const res = await fetch(`/api/footprint/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: newValue }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update')
      }

      setIsPublic(newValue)
    } catch (error) {
      console.error('Failed to toggle public:', error)
      alert(`Failed to update: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsTogglingPublic(false)
    }
  }

  function handleGridModeChange(mode: 'public' | 'edit' | 'spaced') {
    setGridMode(mode)
    setDraft(prev => prev ? {
      ...prev,
      grid_mode: mode,
      updated_at: Date.now(),
    } : null)
  }

  function handleGoLive() {
    if (isOwner) {
      // Already live - go to public page
      window.location.href = `/${slug}`
    } else {
      window.location.href = `/checkout?slug=${encodeURIComponent(slug)}`
    }
  }

  if (isLoading || !draft) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07080A]">
        <div className="font-mono text-white/50 animate-pulse">Loading...</div>
      </div>
    )
  }

  const theme = getTheme(draft.theme)

  return (
    <div className="min-h-screen pb-32" style={{ background: theme.bg, color: theme.text }}>
      {/* Mode indicator + Public/Private toggle */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
        {isOwner && (
          <button
            onClick={handleTogglePublic}
            disabled={isTogglingPublic}
            className={`text-xs font-mono px-3 py-1.5 rounded-md transition ${
              isPublic
                ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                : 'bg-white/10 text-white/50 hover:bg-white/20'
            } disabled:opacity-50`}
            title={isPublic ? 'Page is public - click to make private' : 'Page is private - click to make public'}
          >
            {isTogglingPublic ? '...' : isPublic ? 'Public' : 'Private'}
          </button>
        )}
        <span className="text-xs text-white/40 font-mono">
          {isOwner ? 'editing · live' : 'draft · local'}
        </span>
        {!isOwner && (
          <button
            onClick={handleClearDraft}
            className="text-xs text-white/40 hover:text-white/60 font-mono underline"
          >
            clear
          </button>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Profile Section */}
        <header className="mb-8 text-center">
          <input
            type="text"
            placeholder="Your Name"
            value={draft.display_name}
            onChange={e => setDraft(prev => prev ? { ...prev, display_name: e.target.value, updated_at: Date.now() } : null)}
            className="text-3xl font-light bg-transparent border-none text-center w-full outline-none placeholder:text-white/20"
            style={{ color: theme.text }}
          />
          <input
            type="text"
            placeholder="@handle"
            value={draft.handle}
            onChange={e => setDraft(prev => prev ? { ...prev, handle: e.target.value, updated_at: Date.now() } : null)}
            className="text-sm bg-transparent border-none text-center w-full outline-none mt-2 placeholder:text-white/20"
            style={{ color: theme.muted }}
          />
          <textarea
            placeholder="Bio..."
            value={draft.bio}
            onChange={e => setDraft(prev => prev ? { ...prev, bio: e.target.value, updated_at: Date.now() } : null)}
            className="mt-4 bg-transparent border-none text-center w-full outline-none resize-none placeholder:text-white/20"
            style={{ color: theme.muted }}
            rows={2}
          />
        </header>

        {/* Add Content */}
        <div className="mb-8">
          <div className="relative">
            <input
              type="text"
              placeholder="Paste any URL..."
              value={pasteUrl}
              onChange={e => setPasteUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddContent()}
              className="w-full px-6 py-5 pr-24 bg-white/5 border-2 border-dashed border-white/10 rounded-2xl font-mono text-sm focus:border-white/30 focus:border-solid focus:outline-none"
              style={{ color: theme.text }}
            />
            <button
              onClick={handleAddContent}
              disabled={isAdding || !pasteUrl.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white py-2.5 px-5 rounded-lg font-mono text-xs disabled:opacity-50 transition"
            >
              {isAdding ? '...' : 'Add'}
            </button>
          </div>
          <p className="font-mono text-xs text-white/30 text-center mt-3">
            YouTube, Spotify, Twitter, images, articles — anything
          </p>
        </div>

        {/* Grid Mode Selector */}
        {draft.content.length > 0 && (
          <div className="mb-6 flex items-center justify-center gap-2">
            <span className="font-mono text-xs text-white/30 mr-2">Spacing:</span>
            <button
              onClick={() => handleGridModeChange('public')}
              className={`font-mono text-xs px-3 py-1.5 rounded-md transition ${
                gridMode === 'public'
                  ? 'bg-white/20 text-white'
                  : 'bg-white/5 text-white/40 hover:bg-white/10'
              }`}
            >
              Tight
            </button>
            <button
              onClick={() => handleGridModeChange('edit')}
              className={`font-mono text-xs px-3 py-1.5 rounded-md transition ${
                gridMode === 'edit'
                  ? 'bg-white/20 text-white'
                  : 'bg-white/5 text-white/40 hover:bg-white/10'
              }`}
            >
              Medium
            </button>
            <button
              onClick={() => handleGridModeChange('spaced')}
              className={`font-mono text-xs px-3 py-1.5 rounded-md transition ${
                gridMode === 'spaced'
                  ? 'bg-white/20 text-white'
                  : 'bg-white/5 text-white/40 hover:bg-white/10'
              }`}
            >
              Generous
            </button>
          </div>
        )}

        {/* Content Grid */}
        <div className={gridMode === 'public' ? 'space-y-4' : gridMode === 'edit' ? 'space-y-6' : 'space-y-10'}>
          {draft.content.map(item => (
            <div key={item.id} className="relative group">
              <div className={deletingIds.has(item.id) ? 'opacity-50 pointer-events-none' : ''}>
                <ContentCard
                  content={item as any}
                  editable
                  onDelete={() => handleDelete(item.id)}
                />
              </div>
            </div>
          ))}
        </div>

        {draft.content.length === 0 && (
          <p className="text-center py-12 text-white/30">
            Paste a URL above to add your first tile
          </p>
        )}

        {/* URL Preview */}
        <div className="mt-12 text-center">
          <p className="font-mono text-xs text-white/30">
            {isOwner ? 'Your page is live at' : 'Your page will be live at'}
          </p>
          <p className="font-mono text-sm text-white/60 mt-1">
            footprint.onl/{slug}
          </p>
        </div>
      </div>

      {/* Bottom Button */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40">
        <button
          onClick={handleGoLive}
          className={`px-8 py-4 rounded-2xl font-medium shadow-lg transition transform hover:scale-105 ${
            isOwner
              ? 'bg-white/10 hover:bg-white/20 text-white'
              : 'bg-green-500 hover:bg-green-400 text-white shadow-green-500/25'
          }`}
        >
          {isOwner ? 'View Live Page' : 'Go Live · $10'}
        </button>
      </div>
    </div>
  )
}
