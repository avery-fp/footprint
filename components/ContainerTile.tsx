'use client'

/**
 * CONTAINER TILE — street-level facade for depth navigation
 *
 * A container is a DOOR, not a WINDOW. It holds child tiles inside.
 * At street level it shows a labeled facade with a depth affordance.
 * Tap to enter — expansion handled by parent (PublicPage).
 */

interface ContainerTileProps {
  label: string
  coverUrl?: string | null
  childCount?: number
  firstChildThumb?: string | null
}

export default function ContainerTile({ label, coverUrl, childCount, firstChildThumb }: ContainerTileProps) {
  // Blurred background: prefer coverUrl, fall back to first child thumbnail
  const bgUrl = coverUrl || firstChildThumb

  return (
    <div
      className="w-full h-full relative overflow-hidden group cursor-pointer"
      style={{ borderRadius: 'inherit' }}
    >
      {/* Blurred thumbnail background — the door hints at the space */}
      {bgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          style={{
            filter: 'blur(12px) saturate(0.8)',
            opacity: 0.35,
            transform: 'scale(1.1)',
          }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 100%)',
          }}
        />
      )}

      {/* Subtle dimming overlay so the label always reads on busy bg images */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)' }}
      />

      {/* Label — the door is named, large enough to read at a glance */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
        <span
          className="text-white text-center leading-tight px-2"
          style={{ fontSize: 'clamp(15px, 4vw, 22px)', fontWeight: 400, letterSpacing: '-0.01em' }}
        >
          {label}
        </span>
        {childCount !== undefined && childCount > 0 ? (
          <span
            className="text-white/45 font-mono"
            style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.1em' }}
          >
            {childCount} {childCount === 1 ? 'item' : 'items'}
          </span>
        ) : (
          <span
            className="text-white/30 font-mono"
            style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase' }}
          >
            empty
          </span>
        )}
      </div>

      {/* Hover affordance — stacked-edge corner ticks suggest depth without arrows */}
      <div
        className="absolute top-2 right-2 bottom-2 w-[2px] rounded-full opacity-30 group-hover:opacity-70 transition-opacity duration-300"
        style={{ background: 'rgba(255,255,255,0.5)' }}
      />
    </div>
  )
}
