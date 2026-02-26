'use client'

import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import Image from 'next/image'
import { parseEmbed, getYouTubeThumbnail } from '@/lib/parseEmbed'

interface TileData {
  id: string
  type: string
  url?: string
  title?: string | null
  description?: string | null
  thumbnail_url?: string | null
  embed_html?: string | null
  layers?: any[]
}

interface ExpandedTileOverlayProps {
  tile: TileData | null
  onDismiss: () => void
}

const EXPAND_SPRING = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 0.8,
}

const COLLAPSE_EASE = {
  duration: 0.25,
  ease: [0.4, 0, 0.2, 1] as const,
}

/**
 * ExpandedTileOverlay — THE MOVE
 *
 * Tap a tile → Framer Motion layoutId animates it from grid position
 * to fullscreen. Content renders at full size in void.
 *
 * Dismiss: drag down >80px, tap outside, escape, back button.
 * No chrome. No close button. No UI. Just content in void.
 *
 * Position fixed, z-9000. Body scroll locked.
 */
export default function ExpandedTileOverlay({ tile, onDismiss }: ExpandedTileOverlayProps) {
  const prefersReducedMotion = useReducedMotion()
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const isDragging = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Lock body scroll when expanded
  useEffect(() => {
    if (!tile) return
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [tile])

  // Escape key dismissal
  useEffect(() => {
    if (!tile) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [tile, onDismiss])

  // Back button (popstate) dismissal
  useEffect(() => {
    if (!tile) return
    window.history.pushState({ tileExpanded: true }, '')
    const handlePop = () => onDismiss()
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [tile, onDismiss])

  // Tap outside content to dismiss
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onDismiss()
    }
  }, [onDismiss])

  // Drag-down to dismiss (touch)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    isDragging.current = false
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaY = e.touches[0].clientY - dragStartY.current
    if (deltaY > 20) isDragging.current = true
    if (contentRef.current && deltaY > 0) {
      contentRef.current.style.transform = `translateY(${deltaY}px)`
      contentRef.current.style.opacity = `${Math.max(0.3, 1 - deltaY / 300)}`
    }
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaY = e.changedTouches[0].clientY - dragStartY.current
    if (contentRef.current) {
      contentRef.current.style.transform = ''
      contentRef.current.style.opacity = ''
    }
    if (deltaY > 80) {
      onDismiss()
    }
  }, [onDismiss])

  // Render expanded content based on type
  const renderExpandedContent = (item: TileData) => {
    const isVideo = item.type === 'image' && item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)

    // Image — full res, object-contain, centered in void
    if (item.type === 'image' && !isVideo && item.url) {
      return (
        <div className="w-full h-full flex items-center justify-center p-4">
          <Image
            src={item.url}
            alt={item.title || ''}
            width={1920}
            height={1080}
            sizes="100vw"
            className="max-w-full max-h-full object-contain"
            quality={90}
            priority
          />
        </div>
      )
    }

    // Video — full width, native controls
    if (isVideo && item.url) {
      return (
        <div className="w-full h-full flex items-center justify-center p-4">
          <video
            src={item.url}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-full"
            style={{ outline: 'none' }}
          />
        </div>
      )
    }

    // YouTube — real iframe replaces thumbnail
    if (item.type === 'youtube' && item.url) {
      const embed = parseEmbed(item.url)
      if (embed) {
        return (
          <div className="w-full h-full flex items-center justify-center p-4">
            <div className="w-full" style={{ maxWidth: '960px', aspectRatio: '16/9' }}>
              <iframe
                src={`${embed.embedUrl}?autoplay=1&rel=0`}
                className="w-full h-full"
                style={{ border: 'none' }}
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
              />
            </div>
          </div>
        )
      }
    }

    // Spotify — full player height
    if (item.type === 'spotify' && item.url) {
      const embed = parseEmbed(item.url)
      if (embed) {
        return (
          <div className="w-full h-full flex items-center justify-center p-4">
            <div className="w-full" style={{ maxWidth: '480px' }}>
              <iframe
                src={embed.embedUrl}
                width="100%"
                height={embed.height === 152 ? 352 : 452}
                style={{ border: 'none', borderRadius: '12px' }}
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              />
            </div>
          </div>
        )
      }
    }

    // Apple Music — full player height
    if (item.type === 'applemusic' && item.url) {
      const embed = parseEmbed(item.url)
      if (embed) {
        return (
          <div className="w-full h-full flex items-center justify-center p-4">
            <div className="w-full" style={{ maxWidth: '480px' }}>
              <iframe
                src={`${embed.embedUrl}?theme=dark`}
                width="100%"
                height={embed.height === 175 ? 450 : 450}
                style={{ border: 'none', borderRadius: '12px', overflow: 'hidden' }}
                allow="autoplay *; encrypted-media *; fullscreen *"
              />
            </div>
          </div>
        )
      }
    }

    // SoundCloud — full player
    if (item.type === 'soundcloud' && item.url) {
      const embed = parseEmbed(item.url)
      if (embed) {
        return (
          <div className="w-full h-full flex items-center justify-center p-4">
            <div className="w-full" style={{ maxWidth: '480px' }}>
              <iframe
                src={embed.embedUrl}
                width="100%"
                height={300}
                style={{ border: 'none' }}
                allow="autoplay"
              />
            </div>
          </div>
        )
      }
    }

    // Vimeo — full player
    if (item.type === 'vimeo' && item.url) {
      const embed = parseEmbed(item.url)
      if (embed) {
        return (
          <div className="w-full h-full flex items-center justify-center p-4">
            <div className="w-full" style={{ maxWidth: '960px', aspectRatio: '16/9' }}>
              <iframe
                src={embed.embedUrl}
                className="w-full h-full"
                style={{ border: 'none' }}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )
      }
    }

    // Thought / text — max-width 640px, centered, scrollable
    if (item.type === 'thought') {
      const text = item.title || item.description || ''
      return (
        <div className="w-full h-full flex items-center justify-center p-6 overflow-y-auto">
          <div style={{ maxWidth: '640px', width: '100%' }}>
            <p
              className="whitespace-pre-wrap text-center text-white"
              style={{
                fontSize: text.length <= 20 ? '32px' : text.length <= 100 ? '24px' : '18px',
                fontWeight: 300,
                lineHeight: 1.6,
                letterSpacing: '-0.02em',
              }}
            >
              {text}
            </p>
          </div>
        </div>
      )
    }

    // Generic embed — try iframe
    if (item.url) {
      const embed = parseEmbed(item.url)
      if (embed) {
        return (
          <div className="w-full h-full flex items-center justify-center p-4">
            <div className="w-full" style={{ maxWidth: '960px', aspectRatio: embed.aspectRatio || undefined, height: embed.height || undefined }}>
              <iframe
                src={embed.embedUrl}
                className="w-full h-full"
                style={{ border: 'none' }}
                allow="autoplay; fullscreen"
              />
            </div>
          </div>
        )
      }

      // Fallback — link card in expanded view
      let hostname = ''
      try { hostname = new URL(item.url).hostname.replace('www.', '') } catch {}
      return (
        <div className="w-full h-full flex items-center justify-center p-6">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-4 text-white/60 hover:text-white/80 transition-colors"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.06a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.25 8.81" />
            </svg>
            <span className="text-sm font-mono tracking-wider">
              {item.title || hostname}
            </span>
            {item.title && (
              <span className="text-xs font-mono tracking-wider text-white/30">
                {hostname}
              </span>
            )}
          </a>
        </div>
      )
    }

    return null
  }

  return (
    <AnimatePresence mode="wait">
      {tile && (
        <motion.div
          ref={overlayRef}
          key="expanded-overlay"
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 9000 }}
          initial={{ backgroundColor: 'rgba(0,0,0,0)' }}
          animate={{ backgroundColor: 'rgba(0,0,0,0.9)' }}
          exit={{ backgroundColor: 'rgba(0,0,0,0)' }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.25 }}
          onClick={handleOverlayClick}
        >
          <motion.div
            ref={contentRef}
            layoutId={prefersReducedMotion ? undefined : `tile-${tile.id}`}
            className="w-full h-full"
            transition={prefersReducedMotion ? { duration: 0 } : EXPAND_SPRING}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ touchAction: 'none' }}
          >
            {renderExpandedContent(tile)}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
