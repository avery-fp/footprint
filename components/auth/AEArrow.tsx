'use client'

interface AEArrowProps {
  onClick: () => void
  disabled?: boolean
  visible: boolean
}

export default function AEArrow({ onClick, disabled, visible }: AEArrowProps) {
  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(4px)',
        transition: 'opacity 200ms ease, transform 200ms ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label="Continue"
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.4)',
          fontSize: '20px',
          cursor: visible && !disabled ? 'pointer' : 'default',
          padding: '12px',
          minWidth: '44px',
          minHeight: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 200ms ease',
        }}
        onMouseEnter={(e) => {
          if (visible && !disabled) {
            e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
        }}
        tabIndex={visible ? 0 : -1}
      >
        →
      </button>
    </div>
  )
}
