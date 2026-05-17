'use client'

import { useLayoutEffect, useRef, useState } from 'react'

/**
 * TEXT TILE — always-on full text, no click-to-expand.
 *
 * Public view: tile sits flush on the wallpaper (parent wrappers neutralized
 * to transparent + overflow visible), text grows downward to fit content, and
 * scrolls internally past a max-height when very long.
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

  const baseClasses = isPublicView
    ? 'flex items-center justify-center p-5 rounded-2xl'
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
    <div ref={rootRef} className={baseClasses} style={positionStyle}>
      <div
        ref={scrollRef}
        className="w-full"
        style={{
          minHeight: overflows ? undefined : '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          maxHeight: 'min(480px, 70vh)',
          overflowY: 'auto',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          ...(overflows
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
            ...TEXT_STYLES[textStyle || 'clean'],
            letterSpacing: '0',
            paddingBottom: overflows ? 16 : 0,
          }}
        >
          {text}
        </p>
      </div>
    </div>
  )
}
