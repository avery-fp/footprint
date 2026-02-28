'use client'

interface AeArrowProps {
  onClick: () => void
  disabled?: boolean
  visible: boolean
}

export default function AeArrow({ onClick, disabled, visible }: AeArrowProps) {
  return (
    <button
      type="submit"
      onClick={(e) => { e.preventDefault(); onClick() }}
      disabled={disabled}
      aria-label="Continue"
      style={{
        background: 'none',
        border: 'none',
        color: visible ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
        fontSize: '20px',
        cursor: visible && !disabled ? 'pointer' : 'default',
        padding: '12px',
        minWidth: '44px',
        minHeight: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 200ms ease, opacity 200ms ease',
      }}
      onMouseEnter={(e) => {
        if (visible && !disabled) {
          e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = visible ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'
      }}
    >
      {disabled ? '...' : '\u2192'}
    </button>
  )
}
