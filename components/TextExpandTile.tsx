'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import ArtifactShell from '@/components/ArtifactShell'

/**
 * TEXT TILE — surface preview in the grid, full reader in ArtifactShell.
 *
 * Public view: tile sits flush on the wallpaper (parent wrappers neutralized
 * to transparent) and opens a quiet full-text reader on click.
 * Editor view: keeps fp-tile/fp-surface chrome so the editor still reads the
 * thought as a distinct card; the editor-mode click overlay opens the sheet.
 */

interface TextExpandTileProps {
  text: string
  isPublicView?: boolean
  textStyle?: 'clean' | 'editorial' | 'mono' | null
}

const TEXT_STYLES = {
  clean: {
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontWeight: 300,
    fontSize: 16,
    lineHeight: 1.6,
  },
  editorial: {
    fontFamily: "Iowan Old Style, 'Times New Roman', serif",
    fontWeight: 400,
    fontSize: 18,
    lineHeight: 1.48,
  },
  mono: {
    fontFamily: "'DM Mono', ui-monospace, monospace",
    fontWeight: 300,
    fontSize: 14,
    lineHeight: 1.7,
  },
} as const

export default function TextExpandTile({ text, isPublicView = false, textStyle = 'clean' }: TextExpandTileProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)
  const [readerOpen, setReaderOpen] = useState(false)
  const activeStyle = TEXT_STYLES[textStyle || 'clean']
  const canOpenReader = isPublicView && text.trim().length > 0

  // Detect actual overflow so the bottom fade only applies when there is more text below.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [text])

  // Public-view: the tile sits inside a fixed-aspect media cell. Neutralize
  // the inherited chrome so the text reads as flush wallpaper content, and
  // let the tile grow downward beyond the cell.
  useLayoutEffect(() => {
    if (!isPublicView) return
    const shell = rootRef.current?.closest<HTMLElement>('.fp-text-tile-shell')
    const chrome = rootRef.current?.closest<HTMLElement>('.fp-tile-hover')
    if (!shell || !chrome) return
    shell.style.background = 'transparent'
    chrome.style.overflow = 'visible'
    chrome.style.background = 'transparent'
    chrome.style.borderColor = 'transparent'
  }, [isPublicView])

  const openReader = () => {
    if (canOpenReader) setReaderOpen(true)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canOpenReader) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setReaderOpen(true)
    }
  }

  const baseClasses = isPublicView
    ? `flex items-center justify-center p-5 rounded-2xl ${canOpenReader ? 'cursor-pointer' : ''}`
    : 'fp-tile fp-surface flex items-center justify-center p-5 rounded-2xl'

  const positionStyle = isPublicView
    ? ({
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        zIndex: 30,
        height: 'auto',
        minHeight: '100%',
        background: 'transparent',
      } as const)
    : ({ position: 'relative', width: '100%', height: '100%' } as const)

  return (
    <>
    <div
      ref={rootRef}
      className={baseClasses}
      style={positionStyle}
      role={canOpenReader ? 'button' : undefined}
      tabIndex={canOpenReader ? 0 : undefined}
      aria-label={canOpenReader ? 'Open text reader' : undefined}
      onClick={openReader}
      onKeyDown={onKeyDown}
    >
      <div
        ref={scrollRef}
        className="w-full"
        style={{
          minHeight: overflows ? undefined : '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          maxHeight: isPublicView ? '100%' : 'min(480px, 70vh)',
          overflowY: isPublicView ? 'hidden' : 'auto',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          ...(!isPublicView && overflows
            ? {
                maskImage:
                  'linear-gradient(to bottom, black calc(100% - 16px), transparent 100%)',
                WebkitMaskImage:
                  'linear-gradient(to bottom, black calc(100% - 16px), transparent 100%)',
              }
            : null),
        }}
      >
        <p
          className={`whitespace-pre-wrap text-center ${isPublicView ? 'text-white' : 'opacity-90'}`}
          style={{
            ...activeStyle,
            letterSpacing: '0',
            paddingBottom: !isPublicView && overflows ? 16 : 0,
            ...(isPublicView
              ? {
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 6,
                  overflow: 'hidden',
                }
              : null),
          }}
        >
          {text}
        </p>
      </div>
    </div>
    {readerOpen && (
      <ArtifactShell onDismiss={() => setReaderOpen(false)} wide>
        <article
          className="mx-auto rounded-2xl border border-white/10 bg-white/[0.07] px-6 py-7 text-white shadow-2xl sm:px-9 sm:py-8"
          style={{
            backdropFilter: 'blur(22px) saturate(120%)',
            WebkitBackdropFilter: 'blur(22px) saturate(120%)',
          }}
        >
          <div className="mb-5 text-[10px] uppercase tracking-[0.24em] text-white/35">
            Thought
          </div>
          <div
            className="whitespace-pre-wrap text-left text-white/85"
            style={{
              ...activeStyle,
              fontSize: Math.max(activeStyle.fontSize, 17),
              lineHeight: Math.max(activeStyle.lineHeight, 1.62),
              letterSpacing: '0',
            }}
          >
            {text}
          </div>
        </article>
      </ArtifactShell>
    )}
    </>
  )
}
