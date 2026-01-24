'use client'

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
  
  // Get hostname for link display
  let hostname = 'Link'
  try {
    hostname = new URL(content.url).hostname.replace('www.', '')
  } catch {}

  // For embeddable content, show the embed
  if (content.embed_html && ['youtube', 'spotify', 'applemusic', 'vimeo', 'soundcloud'].includes(content.type)) {
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
          className="w-full"
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

  // For images
  if (content.type === 'image' && content.thumbnail_url) {
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
            src={content.thumbnail_url} 
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

  // For Twitter/X, Instagram, TikTok - social embeds
  if (['twitter', 'instagram', 'tiktok'].includes(content.type)) {
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
      className="glass rounded-xl overflow-hidden card-hover relative group flex items-center gap-4 p-5"
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
