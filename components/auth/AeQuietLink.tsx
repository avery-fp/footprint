'use client'

interface AeQuietLinkProps {
  text: string
  onClick: () => void
}

export default function AeQuietLink({ text, onClick }: AeQuietLinkProps) {
  return (
    <button
      onClick={onClick}
      className="touch-manipulation"
      style={{
        background: 'none',
        border: 'none',
        color: 'rgba(255,255,255,0.25)',
        fontSize: '13px',
        cursor: 'pointer',
        padding: '12px',
        textDecoration: 'none',
        transition: 'color 200ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'rgba(255,255,255,0.25)'
      }}
    >
      {text}
    </button>
  )
}
