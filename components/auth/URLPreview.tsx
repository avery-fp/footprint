'use client'

interface URLPreviewProps {
  username: string
  state: 'available' | 'taken' | 'checking'
}

export default function URLPreview({ username, state }: URLPreviewProps) {
  const usernameColor =
    state === 'taken'
      ? 'rgba(255,80,80,0.4)'
      : 'rgba(255,255,255,0.9)'

  return (
    <p
      style={{
        fontFamily: 'monospace',
        fontSize: '13px',
        letterSpacing: '0.02em',
        minHeight: '20px',
        transition: 'color 300ms ease',
      }}
    >
      {username.length > 0 ? (
        <>
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>footprint.onl/</span>
          <span style={{ color: usernameColor, transition: 'color 300ms ease' }}>
            {username}
          </span>
        </>
      ) : (
        <span style={{ opacity: 0 }}>.</span>
      )}
    </p>
  )
}
