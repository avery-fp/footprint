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
}

export default function ContainerTile({ label, coverUrl, childCount }: ContainerTileProps) {
  return (
    <div
      className="w-full h-full relative overflow-hidden group cursor-pointer"
      style={{ borderRadius: 'inherit' }}
    >
      {/* Cover image or dark glass */}
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          style={{ filter: 'brightness(0.35) saturate(0.8)' }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
          }}
        />
      )}

      {/* Stacked-layer depth cue — two thin lines suggesting layers behind */}
      <div
        className="absolute top-2 right-2 bottom-2 w-[3px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: 'rgba(255,255,255,0.08)' }}
      />
      <div
        className="absolute top-3 right-3.5 bottom-3 w-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-75"
        style={{ background: 'rgba(255,255,255,0.04)' }}
      />

      {/* Permanent subtle depth indicator — stacked edge */}
      <div
        className="absolute top-1.5 right-1 bottom-1.5 w-[2px] rounded-full"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      />

      {/* Label + enter affordance */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
        <span
          className="text-white/80 font-mono tracking-[0.15em] uppercase text-center leading-tight"
          style={{ fontSize: '11px', fontWeight: 400 }}
        >
          {label}
        </span>

        {/* Enter arrow — subtle, appears on hover */}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center opacity-40 group-hover:opacity-80 transition-all duration-300 group-hover:scale-110"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <svg className="w-3 h-3 text-white/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
          </svg>
        </div>

        {/* Child count badge */}
        {childCount !== undefined && childCount > 0 && (
          <span
            className="text-white/25 font-mono"
            style={{ fontSize: '9px', letterSpacing: '0.1em' }}
          >
            {childCount} {childCount === 1 ? 'tile' : 'tiles'}
          </span>
        )}
      </div>

      {/* Bottom border glow — architectural entry line */}
      <div
        className="absolute bottom-0 left-4 right-4 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }}
      />
    </div>
  )
}
