'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

interface RemixData {
  footprint: {
    slug: string
    display_name: string | null
    bio: string | null
    serial_number: number
    theme_id: string
  }
  room: { id: string; name: string } | null
  content: {
    image_urls: string[]
    embed_urls: string[]
    tiles: {
      type: string
      url: string
      title?: string
      thumbnail?: string
      embed_html?: string
      position: number
      size: number
    }[]
  }
  theme: {
    id: string
    name: string
    colors: Record<string, string>
  }
}

export default function RemixPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const roomName = searchParams.get('room')

  const [data, setData] = useState<RemixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const url = roomName
          ? `/api/aro/remix-data?slug=${slug}&room=${encodeURIComponent(roomName)}`
          : `/api/aro/remix-data?slug=${slug}`

        const res = await fetch(url)
        if (!res.ok) throw new Error('Not found')
        const json = await res.json()
        setData(json)
      } catch {
        setError('This footprint could not be found.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [slug, roomName])

  const handleCheckout = async () => {
    setCheckingOut(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: undefined, // Stripe will collect email
          slug: undefined, // New user will get auto-generated slug
          remix_source: slug,
          remix_room: roomName || undefined,
        }),
      })

      const json = await res.json()
      if (json.url) {
        // Store remix info for post-purchase cloning
        sessionStorage.setItem(
          'fp_remix',
          JSON.stringify({
            source_slug: slug,
            room_name: roomName,
            theme_id: data?.theme.id,
          })
        )
        window.location.href = json.url
      }
    } catch {
      setCheckingOut(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={styles.errorContainer}>
        <p>{error || 'Something went wrong.'}</p>
        <a href="https://footprint.onl" style={styles.backLink}>
          footprint.onl
        </a>
      </div>
    )
  }

  const displayName = data.footprint.display_name || data.footprint.slug
  const serial = String(data.footprint.serial_number).padStart(4, '0')
  const imageItems = data.content.tiles.filter((t) => t.type === 'image')
  const embedItems = data.content.tiles.filter((t) => t.type !== 'image')

  return (
    <div
      style={{
        ...styles.page,
        background: data.theme.colors.background,
        color: data.theme.colors.text,
      }}
    >
      {/* Header */}
      <header style={styles.header}>
        <a href="https://footprint.onl" style={styles.logo}>
          footprint
        </a>
      </header>

      {/* Source info */}
      <div style={styles.sourceInfo}>
        <p style={{ ...styles.sourceLabel, color: data.theme.colors.textMuted }}>
          inspired by
        </p>
        <h1 style={styles.sourceName}>
          {displayName}&apos;s {data.room?.name || 'footprint'}
        </h1>
        <p style={{ ...styles.sourceSerial, color: data.theme.colors.textMuted }}>
          #{serial}
        </p>
      </div>

      {/* Content preview */}
      <div style={styles.previewGrid}>
        {imageItems.slice(0, 9).map((tile, i) => (
          <div
            key={i}
            style={{
              ...styles.previewTile,
              border: `1px solid ${data.theme.colors.border}`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tile.url}
              alt=""
              style={styles.previewImage}
              loading="lazy"
            />
          </div>
        ))}
      </div>

      {/* Embed preview (show types) */}
      {embedItems.length > 0 && (
        <div style={styles.embedPreview}>
          {embedItems.slice(0, 4).map((tile, i) => (
            <div
              key={i}
              style={{
                ...styles.embedTag,
                background: data.theme.colors.glass,
                border: `1px solid ${data.theme.colors.border}`,
              }}
            >
              <span style={styles.embedIcon}>
                {tile.type === 'spotify'
                  ? '♫'
                  : tile.type === 'youtube'
                  ? '▶'
                  : tile.type === 'twitter'
                  ? '𝕏'
                  : '◎'}
              </span>
              {tile.title || tile.type}
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <div style={styles.ctaSection}>
        <h2 style={styles.ctaTitle}>Make yours</h2>
        <p style={{ ...styles.ctaDescription, color: data.theme.colors.textMuted }}>
          Get your own footprint with this space&apos;s style. Swap, add, or
          remove anything to make it yours.
        </p>
        <button
          onClick={handleCheckout}
          disabled={checkingOut}
          style={{
            ...styles.ctaButton,
            background: data.theme.colors.accent,
            color:
              data.theme.id === 'paper' || data.theme.id === 'cream'
                ? '#FFFFFF'
                : data.theme.colors.background.startsWith('#')
                ? data.theme.colors.background
                : '#000000',
          }}
        >
          {checkingOut ? 'Loading...' : 'Make yours'}
        </button>
        <p style={{ ...styles.ctaNote, color: data.theme.colors.textMuted }}>
          Yours forever. Customize everything.
        </p>
      </div>

      {/* Footer */}
      <footer style={{ ...styles.footer, borderColor: data.theme.colors.border }}>
        <a
          href={`https://footprint.onl/${slug}`}
          style={{ ...styles.footerLink, color: data.theme.colors.textMuted }}
        >
          View {displayName}&apos;s full footprint →
        </a>
      </footer>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '20px',
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#07080A',
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '2px solid rgba(255,255,255,0.1)',
    borderTop: '2px solid #F5F5F5',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#07080A',
    color: 'rgba(255,255,255,0.5)',
  },
  backLink: {
    color: '#F5F5F5',
    textDecoration: 'none',
    marginTop: '12px',
  },
  header: {
    padding: '20px 0',
    marginBottom: '20px',
  },
  logo: {
    fontSize: '14px',
    color: 'inherit',
    textDecoration: 'none',
    opacity: 0.4,
    fontWeight: 500,
  },
  sourceInfo: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  sourceLabel: {
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    margin: '0 0 8px',
  },
  sourceName: {
    fontSize: '28px',
    fontWeight: 700,
    margin: '0 0 4px',
    letterSpacing: '-0.02em',
  },
  sourceSerial: {
    fontSize: '14px',
    margin: 0,
  },
  previewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginBottom: '16px',
  },
  previewTile: {
    aspectRatio: '1',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  embedPreview: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: '32px',
  },
  embedTag: {
    padding: '6px 14px',
    borderRadius: '20px',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  embedIcon: { fontSize: '14px' },
  ctaSection: {
    textAlign: 'center',
    padding: '40px 0',
  },
  ctaTitle: {
    fontSize: '24px',
    fontWeight: 700,
    margin: '0 0 8px',
  },
  ctaDescription: {
    fontSize: '14px',
    margin: '0 0 24px',
    lineHeight: 1.5,
    maxWidth: '400px',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  ctaButton: {
    padding: '14px 40px',
    borderRadius: '12px',
    border: 'none',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '-0.01em',
  },
  ctaNote: {
    fontSize: '12px',
    marginTop: '12px',
  },
  footer: {
    textAlign: 'center',
    paddingTop: '24px',
    marginTop: '40px',
    borderTop: '1px solid',
  },
  footerLink: {
    fontSize: '13px',
    textDecoration: 'none',
  },
}
