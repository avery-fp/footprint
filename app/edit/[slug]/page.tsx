'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { nanoid } from 'nanoid'
import { parseURL } from '@/lib/parser'
import { loadDraft, saveDraft, clearDraft, DraftFootprint, DraftContent } from '@/lib/draft-store'
import ContentCard from '@/components/ContentCard'
import { getTheme } from '@/lib/themes'

export default function PublicEditPage() {
  const params = useParams()
  const slug = params.slug as string

  const [draft, setDraft] = useState<DraftFootprint | null>(null)
  const [pasteUrl, setPasteUrl] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)

  // Load draft from localStorage on mount
  useEffect(() => {
    const existingDraft = loadDraft(slug)
    if (existingDraft) {
      setDraft(existingDraft)
    } else {
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
    setIsLoading(false)
  }, [slug])

  // Debounced save to localStorage
  const saveToLocalStorage = useCallback((d: DraftFootprint) => {
    saveDraft(slug, d)
  }, [slug])

  // Auto-save on every change
  useEffect(() => {
    if (draft && !isLoading) {
      const timeout = setTimeout(() => {
        saveToLocalStorage(draft)
      }, 300)
      return () => clearTimeout(timeout)
    }
  }, [draft, isLoading, saveToLocalStorage])

  // Save before unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (draft) saveDraft(slug, draft)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [draft, slug])

  async function handleAddContent() {
    if (!pasteUrl.trim() || !draft) return
    setIsAdding(true)
    try {
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
      setPasteUrl('')
    } catch (e) {
      console.error('Failed to parse URL:', e)
    } finally {
      setIsAdding(false)
    }
  }

  function handleDelete(id: string) {
    setDraft(prev => prev ? {
      ...prev,
      content: prev.content.filter(c => c.id !== id),
      updated_at: Date.now(),
    } : null)
  }

  function handleClearDraft() {
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

  function handleGoLive() {
    window.location.href = `/checkout?slug=${encodeURIComponent(slug)}`
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
      {/* Draft mode indicator */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
        <span className="text-xs text-white/40 font-mono">draft · local</span>
        <button
          onClick={handleClearDraft}
          className="text-xs text-white/40 hover:text-white/60 font-mono underline"
        >
          clear
        </button>
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

        {/* Content Grid */}
        <div className="space-y-4">
          {draft.content.map(item => (
            <div key={item.id} className="relative group">
              <ContentCard
                content={item as any}
                editable
                onDelete={() => handleDelete(item.id)}
              />
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
            Your page will be live at
          </p>
          <p className="font-mono text-sm text-white/60 mt-1">
            footprint.onl/{slug}
          </p>
        </div>
      </div>

      {/* Go Live Button */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40">
        <button
          onClick={handleGoLive}
          className="px-8 py-4 rounded-2xl bg-green-500 hover:bg-green-400 text-white font-medium shadow-lg shadow-green-500/25 transition transform hover:scale-105"
        >
          Go Live · $10
        </button>
      </div>
    </div>
  )
}
