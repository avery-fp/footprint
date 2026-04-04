'use client'

export default function Divider() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        width: '100%',
        margin: '4px 0',
      }}
    >
      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
      <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '12px', letterSpacing: '0.05em' }}>
        or
      </span>
      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
    </div>
  )
}
