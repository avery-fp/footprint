'use client'

interface AEQuietLinkProps {
  text: string
  onClick: () => void
}

export default function AEQuietLink({ text, onClick }: AEQuietLinkProps) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: 'rgba(255,255,255,0.15)',
        fontSize: '11px',
        cursor: 'pointer',
        padding: '8px',
        textDecoration: 'none',
        transition: 'color 200ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'rgba(255,255,255,0.3)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'rgba(255,255,255,0.15)'
      }}
    >
      {text}
    </button>
  )
}
