'use client'

export default function FloatingCtaBar({ isOwner = false, onClaim }: { isOwner?: boolean; onClaim?: () => void }) {
  if (isOwner) return null

  return (
    <button
      onClick={onClaim}
      className="touch-manipulation animate-cta-fade-in"
      style={{
        position: 'fixed',
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        display: 'inline-flex',
        alignItems: 'center',
        padding: '10px 20px',
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: '9999px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        color: 'rgba(255, 255, 255, 0.75)',
        fontSize: '13px',
        fontWeight: 400,
        letterSpacing: '0.5px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
      }}
    >
      yours {'\u2192'}
    </button>
  )
}
