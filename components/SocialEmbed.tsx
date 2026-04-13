'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'

/**
 * SOCIAL EMBED — Lazy-mounted embed wrapper
 *
 * No third-party scripts until this component mounts.
 * Timeout fallback: if embed doesn't load in 8s, fires onError.
 * Platform noise suppressed: no comments config where possible.
 */

// Lazy-load — zero scripts until ArtifactShell opens
const TikTokEmbed = dynamic(
  () => import('react-social-media-embed').then((m) => ({ default: m.TikTokEmbed })),
  { ssr: false },
)
const InstagramEmbed = dynamic(
  () => import('react-social-media-embed').then((m) => ({ default: m.InstagramEmbed })),
  { ssr: false },
)
const XEmbed = dynamic(
  () => import('react-social-media-embed').then((m) => ({ default: m.XEmbed })),
  { ssr: false },
)

interface SocialEmbedProps {
  url: string
  type: string
  variant?: 'post' | 'profile' | 'repo' | null
  onError?: () => void
  onLoad?: () => void
}

export default function SocialEmbed({ url, type, variant, onError, onLoad }: SocialEmbedProps) {
  const [failed, setFailed] = useState(false)
  const loadedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleLoad = useCallback(() => {
    loadedRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    onLoad?.()
  }, [onLoad])

  const handleError = useCallback(() => {
    setFailed(true)
    onError?.()
  }, [onError])

  // 8-second timeout — if embed doesn't resolve, bail
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      if (!loadedRef.current) handleError()
    }, 8000)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [handleError])

  if (failed) return null

  // ── TikTok post ──
  if (type === 'tiktok' && variant !== 'profile') {
    return (
      <div className="w-full" style={{ minHeight: 400 }} onLoad={handleLoad}>
        <TikTokEmbed url={url} width="100%" />
      </div>
    )
  }

  // ── Instagram post/reel ──
  if (type === 'instagram' && variant !== 'profile') {
    return (
      <div className="w-full" style={{ minHeight: 400 }} onLoad={handleLoad}>
        <InstagramEmbed url={url} width="100%" captioned={false} />
      </div>
    )
  }

  // ── Twitter/X post ──
  if (type === 'twitter' && variant === 'post') {
    return (
      <div className="w-full" style={{ minHeight: 200 }} onLoad={handleLoad}>
        <XEmbed url={url} width="100%" />
      </div>
    )
  }

  // ── Twitter/X timeline (profile URL) ──
  if (type === 'twitter' && variant === 'profile') {
    return <TwitterTimeline url={url} onLoad={handleLoad} onError={handleError} />
  }

  return null
}

// ════════════════════════════════════════════════════════════
// TWITTER TIMELINE — widget.js for profile URLs
// Scrolls INSIDE ArtifactShell. No page reflow.
// ════════════════════════════════════════════════════════════

function TwitterTimeline({
  url,
  onLoad,
  onError,
}: {
  url: string
  onLoad?: () => void
  onError?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handle = url.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/)?.[1]
    if (!handle) {
      onError?.()
      return
    }

    // Check if widget.js is already loaded
    const twttr = (window as any).twttr
    if (twttr?.widgets) {
      createTimeline(twttr, handle, container)
      return
    }

    // Load widget.js
    const script = document.createElement('script')
    script.src = 'https://platform.twitter.com/widgets.js'
    script.async = true
    script.onload = () => {
      const t = (window as any).twttr
      if (t?.widgets) {
        createTimeline(t, handle, container)
      } else {
        onError?.()
      }
    }
    script.onerror = () => onError?.()
    document.head.appendChild(script)

    return () => {
      if (!loadedRef.current) script.remove()
    }

    function createTimeline(t: any, screenName: string, el: HTMLElement) {
      t.widgets
        .createTimeline(
          { sourceType: 'profile', screenName },
          el,
          {
            theme: 'dark',
            chrome: 'noheader nofooter noborders transparent',
            width: '100%',
            height: 600,
            dnt: true,
          },
        )
        .then(() => {
          loadedRef.current = true
          onLoad?.()
        })
        .catch(() => onError?.())
    }
  }, [url, onLoad, onError])

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ minHeight: 200, background: 'transparent' }}
    />
  )
}
