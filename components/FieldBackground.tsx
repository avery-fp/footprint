'use client'

/**
 * FIELD BACKGROUND — ambient aura behind contained media
 *
 * Replaces dead letterbox space with a blurred, dimmed echo of the content.
 * Center = sharp truth. Field = same content, dreamed.
 *
 * Uses the poster/thumbnail image (already cached), CSS filter only,
 * GPU-composited. No canvas, no extra video decode, no WebGL.
 *
 * The artifact is law; the frame must adapt.
 */

interface FieldBackgroundProps {
  /** Poster or thumbnail URL for the blurred background */
  imageUrl: string | null | undefined
  /**
   * Internal intensity variant — controls blur/brightness balance.
   * 'theatre' (default): full-screen backdrop behind expanded video
   * 'embed': behind iframe content in tile grid
   */
  intensity?: 'theatre' | 'embed'
}

// Brightness ×1.25, saturation ×1.10, scrim ×0.75 — same lift ratios as
// the room atmosphere table so field surfaces brighten in step with the
// page they sit on. Embed stays dimmer than theatre by design (it sits
// directly behind iframes and must read as ambient, not foreground).
const INTENSITY = {
  theatre: {
    filter: 'blur(35px) brightness(0.56) saturate(1.43)',
    scrim: 'rgba(0,0,0,0.22)',
  },
  embed: {
    filter: 'blur(28px) brightness(0.44) saturate(1.32)',
    scrim: 'rgba(0,0,0,0.19)',
  },
} as const

export default function FieldBackground({
  imageUrl,
  intensity = 'theatre',
}: FieldBackgroundProps) {
  if (!imageUrl) return null

  const { filter, scrim } = INTENSITY[intensity]

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none field-bg"
      aria-hidden="true"
    >
      {/* Blurred image layer — inset -10% prevents blur edge artifacts */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        style={{
          position: 'absolute',
          inset: '-10%',
          width: '120%',
          height: '120%',
          objectFit: 'cover',
          filter,
        }}
        loading="eager"
        decoding="async"
      />
      {/* Dark scrim — ensures sharp video always reads as source of truth */}
      <div className="absolute inset-0" style={{ background: scrim }} />
    </div>
  )
}
