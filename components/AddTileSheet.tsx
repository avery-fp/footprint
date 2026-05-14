'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { resolveMediaSync } from '@/lib/media/resolveMedia'

/**
 * ADD TILE SHEET
 *
 * Unified "add content" surface: URL paste + file upload + thought input.
 * Callbacks owned by consumers (home/page, build/page).
 *
 * Mobile: bottom sheet appearance. Desktop: inline panel.
 */

interface AddTileSheetProps {
  open: boolean
  onClose: () => void
  /** Called when user submits a URL */
  onAddUrl: (url: string) => void
  /** Called when user selects files */
  onAddFiles: (files: File[]) => void
  /** Called when user submits a thought */
  onAddThought: (text: string) => void
}

// Platform icon indicators for instant feedback
function getPlatformIcon(type: string | null): string {
  switch (type) {
    case 'youtube': return '▶'
    case 'spotify': return '♫'
    case 'soundcloud': return '♫'
    case 'vimeo': return '▶'
    case 'twitter': return '𝕏'
    case 'instagram': return '◎'
    case 'tiktok': return '♪'
    case 'image': return '▣'
    case 'video': return '▶'
    default: return '◎'
  }
}

function getPlatformColor(type: string | null): string {
  switch (type) {
    case 'youtube': return '#FF0000'
    case 'spotify': return '#1DB954'
    case 'soundcloud': return '#ff5500'
    case 'vimeo': return '#1ab7ea'
    default: return 'rgba(255,255,255,0.4)'
  }
}

export default function AddTileSheet({
  open,
  onClose,
  onAddUrl,
  onAddFiles,
  onAddThought,
}: AddTileSheetProps) {
  const [mode, setMode] = useState<'url' | 'thought'>('url')
  const [urlValue, setUrlValue] = useState('')
  const [thoughtValue, setThoughtValue] = useState('')
  const [detectedType, setDetectedType] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const thoughtInputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-detect platform as user types
  useEffect(() => {
    if (!urlValue.trim()) {
      setDetectedType(null)
      return
    }
    const resolved = resolveMediaSync(urlValue.trim())
    setDetectedType(resolved ? resolved.type : null)
  }, [urlValue])

  // Focus input on open
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      if (mode === 'url') urlInputRef.current?.focus()
      else thoughtInputRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [open, mode])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setUrlValue('')
      setThoughtValue('')
      setDetectedType(null)
    }
  }, [open])

  const handleSubmitUrl = useCallback(() => {
    const url = urlValue.trim()
    if (!url) return
    onAddUrl(url)
    setUrlValue('')
    setDetectedType(null)
    onClose()
  }, [urlValue, onAddUrl, onClose])

  const handleSubmitThought = useCallback(() => {
    const text = thoughtValue.trim()
    if (!text) return
    onAddThought(text)
    setThoughtValue('')
    onClose()
  }, [thoughtValue, onAddThought, onClose])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length === 0) return
      onAddFiles(files)
      if (fileInputRef.current) fileInputRef.current.value = ''
      onClose()
    },
    [onAddFiles, onClose]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md mx-auto bg-[#111] border border-white/10 rounded-t-2xl md:rounded-2xl p-6 pb-8 md:pb-6"
        style={{ animation: 'slideUp 200ms ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Primary action icons — upload, link, text. The icons replace
            the old text mode-tabs ("link / upload" + "thought") and the
            in-mode upload/record buttons. Upload triggers the file
            picker directly (which on mobile exposes both gallery and
            camera, so a separate record button is no longer needed).
            Link and text toggle the input below. */}
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload"
            title="Upload"
            className="flex-1 flex items-center justify-center py-3 rounded-lg bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white/80 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>
          <button
            onClick={() => setMode('url')}
            aria-label="Link"
            title="Link"
            aria-pressed={mode === 'url'}
            className={`flex-1 flex items-center justify-center py-3 rounded-lg transition-colors ${
              mode === 'url'
                ? 'bg-white/10 text-white/80'
                : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white/80'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
              <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
            </svg>
          </button>
          <button
            onClick={() => setMode('thought')}
            aria-label="Text"
            title="Text"
            aria-pressed={mode === 'thought'}
            className={`flex-1 flex items-center justify-center py-3 rounded-lg transition-colors ${
              mode === 'thought'
                ? 'bg-white/10 text-white/80'
                : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white/80'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
          </button>
        </div>

        {mode === 'url' ? (
          <>
            {/* URL input with platform detection */}
            <div className="relative mb-4">
              <input
                ref={urlInputRef}
                type="text"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitUrl()
                }}
                placeholder="paste any link..."
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3.5 text-[14px] text-white/80 placeholder:text-white/25 font-mono focus:outline-none focus:border-white/20 transition-colors"
              />
              {detectedType && (
                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm"
                  style={{ color: getPlatformColor(detectedType) }}
                >
                  {getPlatformIcon(detectedType)}
                </div>
              )}
            </div>

            {urlValue.trim() && (
              <button
                onClick={handleSubmitUrl}
                className="w-full py-3 rounded-xl bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-all"
              >
                add
              </button>
            )}
          </>
        ) : (
          <>
            {/* Thought textarea — six rows of breathing room so users can
                draft before save. Enter submits; Shift+Enter is a newline. */}
            <textarea
              ref={thoughtInputRef}
              value={thoughtValue}
              onChange={(e) => setThoughtValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmitThought()
                }
              }}
              placeholder="write something..."
              rows={6}
              style={{ minHeight: 160 }}
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3.5 text-[14px] text-white/80 placeholder:text-white/25 font-mono focus:outline-none focus:border-white/20 transition-colors resize-none mb-4"
            />
            {thoughtValue.trim() && (
              <button
                onClick={handleSubmitThought}
                className="w-full py-3 rounded-xl bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-all"
              >
                add thought
              </button>
            )}
          </>
        )}

        {/* Hidden file input — opens gallery; on mobile the picker also
            exposes camera capture, replacing the dedicated record button. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
