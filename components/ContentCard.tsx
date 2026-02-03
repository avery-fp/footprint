'use client'

import { useState } from 'react'
import { getContentIcon, getContentBackground, ContentType } from '@/lib/parser'

interface ContentCardProps {
  content: {
    id: string
    url: string
    type: ContentType
    title: string | null
    description: string | null
    thumbnail_url: string | null
    embed_html: string | null
  }
  editable?: boolean
  onDelete?: () => void
}

/**
 * Content Card Component
 *
 * Renders a piece of content beautifully based on its type.
 * This is what makes Footprint special - every URL looks gorgeous.
 */
export default function ContentCard({ content, editable, onDelete }: ContentCardProps) {
  const icon = getContentIcon(content.type)
  const customBg = getContentBackground(content.type)
  const [isMuted, setIsMuted] = useState(true)

  // Get hostname for link display
  let hostname = 'Link'
  try {
    hostname = new URL(content.url).hostname.replace('www.', '')
  } catch {}

  // YouTube - edge-to-edge beautiful, tap to unmute
  if (content.type === 'youtube' && content.embed_html) {
    // Swap mute parameter in embed HTML
    const embedWithSound = isMuted
      ? content.embed_html
      : content.embed_html.replace('mute=1', 'mute=0').replace('autoplay=1', 'autoplay=1')

    return (
      <div
        className="w-full aspect-video min-h-[300px] rounded-2xl overflow-hidden cursor-pointer relative group"
        onClick={() => setIsMuted(!isMuted)}
      >
        <div dangerouslySetInnerHTML={{ __html: embedWithSound }} />
        {!isMuted && (
          <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60"></div>
        )}
      </div>
    )
  }

  // Spotify - if no embed_html, render as beautiful gradient link card
  if (content.type === 'spotify') {
    if (content.embed_html) {
      // Has proper embed - show it edge-to-edge
      return (
        <div
          className="w-full min-h-[152px] rounded-2xl overflow-hidden"
          dangerouslySetInnerHTML={{ __html: content.embed_html }}
        />
      )
    }
    // Fallback: beautiful link card with Spotify branding
    return (
      <a
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-2xl overflow-hidden p-6 transition-all"
        style={{ background: 'linear-gradient(135deg, #1DB954, #191414)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="text-3xl">♫</div>
          <p className="font-mono text-xs text-white/60 uppercase tracking-wider">Spotify</p>
        </div>
        <p className="text-white/90 text-sm">Listen on Spotify →</p>
      </a>
    )
  }

  // For other embeddable content, show the embed
  if (content.embed_html && ['applemusic', 'vimeo', 'soundcloud'].includes(content.type)) {
    // Determine min-height based on type to prevent layout shift
    let minHeightClass = ''
    if (content.type === 'vimeo') {
      minHeightClass = 'min-h-[200px]'
    } else if (content.type === 'applemusic') {
      minHeightClass = 'min-h-[175px]'
    } else if (content.type === 'soundcloud') {
      minHeightClass = 'min-h-[166px]'
    }

    return (
      <div className="glass rounded-xl overflow-hidden card-hover relative group">
        {/* Delete button when editable */}
        {editable && (
          <button
            onClick={onDelete}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg bg-black/70 text-white/80 hover:bg-red-500 hover:text-white opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all flex items-center justify-center"
          >
            ×
          </button>
        )}

        {/* Embed */}
        <div
          className={`w-full ${minHeightClass}`}
          dangerouslySetInnerHTML={{ __html: content.embed_html }}
        />

        {/* Info */}
        <div className="p-4">
          <p className="font-mono text-xs text-white/40 uppercase tracking-wider mb-1">
            {content.type}
          </p>
          <p className="text-sm font-medium truncate">
            {content.title || 'Untitled'}
          </p>
        </div>
      </div>
    )
  }

  // For videos (native video files)
  if (content.type === 'video') {
    return (
      <div className="glass rounded-xl overflow-hidden card-hover relative group">
        {editable && (
          <button
            onClick={onDelete}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg bg-black/70 text-white/80 hover:bg-red-500 hover:text-white opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all flex items-center justify-center"
          >
            ×
          </button>
        )}

        <video
          src={content.url}
          autoPlay
          muted
          loop
          playsInline
          controls
          className="w-full aspect-video object-cover"
        />

        <div className="p-4">
          <p className="font-mono text-xs text-white/40 uppercase tracking-wider mb-1">
            Video
          </p>
          <p className="text-sm font-medium truncate">
            {content.title || 'Video'}
          </p>
        </div>
      </div>
    )
  }

  // For images
  if (content.type === 'image') {
    return (
      <div className="glass rounded-xl overflow-hidden card-hover relative group">
        {editable && (
          <button
            onClick={onDelete}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg bg-black/70 text-white/80 hover:bg-red-500 hover:text-white opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all flex items-center justify-center"
          >
            ×
          </button>
        )}

        <a href={content.url} target="_blank" rel="noopener noreferrer">
          <img
            src={content.url}
            alt={content.title || ''}
            className="w-full aspect-[4/3] object-cover"
            loading="lazy"
          />
        </a>

        <div className="p-4">
          <p className="font-mono text-xs text-white/40 uppercase tracking-wider mb-1">
            Image
          </p>
          <p className="text-sm font-medium truncate">
            {content.title || 'Image'}
          </p>
        </div>
      </div>
    )
  }

  // For "thought" - glass text notebook page
  if (content.type === 'thought') {
    return (
      <div className="rounded-2xl overflow-hidden card-hover relative group p-8 bg-white/[0.03] backdrop-blur-xl border border-white/10 hover:border-white/20 transition-all">
        {editable && (
          <button
            onClick={onDelete}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg bg-black/70 text-white/80 hover:bg-red-500 hover:text-white opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all flex items-center justify-center"
          >
            ×
          </button>
        )}

        <p className="text-base leading-relaxed whitespace-pre-wrap text-white/90">
          {content.title || content.description || ''}
        </p>
      </div>
    )
  }

  // For Twitter/X, Instagram, TikTok - social embeds
  if (['twitter', 'instagram', 'tiktok'].includes(content.type)) {
    return (
      <div className="rounded-xl overflow-hidden card-hover relative group bg-white/[0.03] backdrop-blur-xl border border-white/10 hover:border-white/20 transition-all">
        {editable && (
          <button
            onClick={onDelete}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg bg-black/70 text-white/80 hover:bg-red-500 hover:text-white opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all flex items-center justify-center"
          >
            ×
          </button>
        )}

        <a
          href={content.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg">
              {icon}
            </div>
            <div>
              <p className="font-mono text-xs text-white/40 uppercase tracking-wider">
                {content.type}
              </p>
            </div>
          </div>

          <p className="text-sm text-white/70 line-clamp-3">
            {content.title || 'View on ' + content.type}
          </p>
        </a>
      </div>
    )
  }

  // Default: link card
  return (
    <a
      href={content.url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-xl overflow-hidden card-hover relative group flex items-center gap-4 p-5 bg-white/[0.03] backdrop-blur-xl border border-white/10 hover:border-white/20 transition-all"
    >
      {editable && (
        <button
          onClick={(e) => {
            e.preventDefault()
            onDelete?.()
          }}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg bg-black/70 text-white/80 hover:bg-red-500 hover:text-white opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all flex items-center justify-center"
        >
          ×
        </button>
      )}
      
      {/* Icon */}
      <div 
        className="w-12 h-12 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
        style={{ background: customBg || 'rgba(255,255,255,0.1)' }}
      >
        {content.thumbnail_url ? (
          <img 
            src={content.thumbnail_url} 
            alt="" 
            className="w-full h-full rounded-lg object-cover"
          />
        ) : (
          icon
        )}
      </div>
      
      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">
          {content.title || hostname}
        </p>
        <p className="font-mono text-xs text-white/40 truncate">
          {hostname}
        </p>
      </div>
      
      {/* Arrow */}
      <span className="text-white/30 text-lg flex-shrink-0 group-hover:translate-x-1 transition-transform">
        →
      </span>
    </a>
  )
}
