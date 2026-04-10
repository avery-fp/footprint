'use client'

import { motion, useMotionValue, animate } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import ArtifactShell from '@/components/ArtifactShell'
import ZoomableImage from '@/components/ZoomableImage'
import { transformImageUrl } from '@/lib/image'

interface ArtifactImageViewerProps {
  item: {
    id: string
    url: string
    title?: string | null
    description?: string | null
  } | null
  open: boolean
  onClose: () => void
}

export default function ArtifactImageViewer({ item, open, onClose }: ArtifactImageViewerProps) {
  const y = useMotionValue(0)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    if (!open) {
      y.set(0)
      setZoomed(false)
    }
  }, [open, y])

  const metadata = useMemo(() => {
    if (!item) return null

    const title = item.title?.trim()
    const description = item.description?.trim()
    if (!title && !description) return null

    return (
      <div className="space-y-1">
        {title ? (
          <p className="text-[13px] tracking-[0.06em] text-white/84">
            {title}
          </p>
        ) : null}
        {description ? (
          <p className="text-[11px] leading-relaxed text-white/46">
            {description}
          </p>
        ) : null}
      </div>
    )
  }, [item])

  if (!item) return null

  return (
    <ArtifactShell
      kind="gallery"
      open={open}
      onClose={onClose}
      metadata={metadata || undefined}
    >
      <motion.div
        className="flex h-full w-full items-center justify-center"
        drag={zoomed ? false : 'y'}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.18}
        style={{
          y,
          display: 'flex',
          height: '100%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onDragEnd={(_, info) => {
          const shouldClose = Math.abs(info.offset.y) > 120 || Math.abs(info.velocity.y) > 700
          if (!zoomed && shouldClose) {
            onClose()
            return
          }

          animate(y, 0, {
            duration: 0.28,
            ease: [0.22, 1, 0.36, 1],
          })
        }}
      >
        <motion.div
          className="relative h-full w-full max-w-[min(92rem,100vw)] overflow-hidden"
          style={{
            position: 'relative',
            height: '100%',
            width: '100%',
            maxWidth: 'min(92rem, 100vw)',
            overflow: 'hidden',
            maxHeight: 'calc(100dvh - 3rem)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.32)',
          }}
        >
          <ZoomableImage
            className="h-full w-full"
            onZoomChange={setZoomed}
            maxScale={4}
          >
            <div
              className="relative h-full w-full bg-black"
              style={{ position: 'relative', height: '100%', width: '100%', background: '#000' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={transformImageUrl(item.url)}
                alt={item.title || ''}
                className="h-full w-full object-contain"
                draggable={false}
                style={{ display: 'block', height: '100%', width: '100%', objectFit: 'contain' }}
              />
            </div>
          </ZoomableImage>
        </motion.div>
      </motion.div>
    </ArtifactShell>
  )
}
