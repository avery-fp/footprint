'use client'

import { useState, useEffect, useCallback } from 'react'

interface Pack {
  id: string
  pack_id: string
  name: string
  slug: string
  room_name: string | null
  cluster: string | null
  captions: string[]
  targets: Target[]
  score: number
  status: string
}

interface Target {
  channel: string
  surface: string
  url: string
  posted: boolean
  placement_url?: string
}

interface Stats {
  totals: { posts: number; clicks: number; conversions: number }
  by_channel: Record<string, { posts: number; clicks: number; conversions: number }>
}

interface Screenshots {
  [format: string]: string
}

export default function AroDashboard() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [packs, setPacks] = useState<Pack[]>([])
  const [currentPackIndex, setCurrentPackIndex] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [screenshots, setScreenshots] = useState<Screenshots>({})
  const [loadingScreenshots, setLoadingScreenshots] = useState(false)
  const [copiedCaption, setCopiedCaption] = useState<number | null>(null)
  const [newPackForm, setNewPackForm] = useState(false)

  /**
   * Auth check: call session-verified API endpoint.
   * The server verifies fp_session cookie + admin allowlist.
   * No client-side secrets. No localStorage. No spoofable headers.
   */
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/aro/stats?days=1', {
          credentials: 'include',
        })
        if (res.ok) {
          setAuthenticated(true)
          loadData()
        } else {
          setAuthenticated(false)
        }
      } catch {
        setAuthenticated(false)
      }
    }
    checkSession()
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!authenticated) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setCurrentPackIndex((i) => Math.min(i + 1, packs.length - 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setCurrentPackIndex((i) => Math.max(i - 1, 0))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [authenticated, packs.length])

  const loadData = useCallback(async () => {
    // Load packs — cookie sent automatically
    try {
      const packRes = await fetch('/api/aro/packs', { credentials: 'include' })
      if (packRes.ok) {
        const packData = await packRes.json()
        setPacks(packData.packs || [])
      }
    } catch {}

    // Load stats — cookie sent automatically
    try {
      const statsRes = await fetch('/api/aro/stats', { credentials: 'include' })
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(statsData)
      }
    } catch {}
  }, [])

  const currentPack = packs[currentPackIndex]

  const generateScreenshots = async () => {
    if (!currentPack) return
    setLoadingScreenshots(true)
    try {
      const res = await fetch('/api/aro/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          slug: currentPack.slug,
          room_name: currentPack.room_name,
          formats: ['1x1', '4x5', '16x9', '9x16'],
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setScreenshots(data.screenshots)
      }
    } catch (err) {
      console.error('Screenshot generation failed:', err)
    }
    setLoadingScreenshots(false)
  }

  const copyCaption = (caption: string, index: number) => {
    navigator.clipboard.writeText(caption)
    setCopiedCaption(index)
    setTimeout(() => setCopiedCaption(null), 2000)
  }

  const markPosted = async (targetIndex: number, placementUrl?: string) => {
    if (!currentPack) return
    const target = currentPack.targets[targetIndex]

    // Record to distribution events — cookie auth, no aro_key in body
    await fetch('/api/aro/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        serial_number: 0,
        channel: target.channel,
        surface: target.surface,
        pack_id: currentPack.pack_id,
        placement_url: placementUrl || null,
      }),
    })

    // Update local state
    const updated = [...packs]
    updated[currentPackIndex].targets[targetIndex].posted = true
    if (placementUrl) {
      updated[currentPackIndex].targets[targetIndex].placement_url = placementUrl
    }
    setPacks(updated)

    // Update pack in DB — cookie auth, no aro_key in body
    await fetch('/api/aro/packs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        pack_id: currentPack.pack_id,
        targets: updated[currentPackIndex].targets,
      }),
    })
  }

  const createPack = async (formData: {
    name: string
    slug: string
    room_name: string
    cluster: string
    captions: string[]
    targets: { channel: string; surface: string; url: string }[]
  }) => {
    const packId = formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

    await fetch('/api/aro/packs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        pack_id: packId,
        ...formData,
      }),
    })

    setNewPackForm(false)
    loadData()
  }

  // Loading state
  if (authenticated === null) {
    return (
      <div style={styles.authContainer}>
        <div style={styles.authBox}>
          <h1 style={styles.authTitle}>ARO</h1>
          <p style={styles.authSubtitle}>verifying session...</p>
        </div>
      </div>
    )
  }

  // Not authenticated — no client-side key entry, redirect to login
  if (!authenticated) {
    return (
      <div style={styles.authContainer}>
        <div style={styles.authBox}>
          <h1 style={styles.authTitle}>ARO</h1>
          <p style={styles.authSubtitle}>deployment dashboard</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginTop: '16px' }}>
            Admin session required.
          </p>
          <a
            href="/login"
            style={{
              ...styles.authButton,
              display: 'inline-block',
              textDecoration: 'none',
              marginTop: '12px',
            }}
          >
            Sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>DEPLOYMENT DASHBOARD</h1>
          <span style={styles.packCount}>
            {packs.length} packs
          </span>
        </div>
        <div style={styles.headerRight}>
          <button
            onClick={() => setNewPackForm(true)}
            style={styles.newPackButton}
          >
            + New Pack
          </button>
          <a href="/api/auth/signout" style={styles.logoutButton}>
            Sign out
          </a>
        </div>
      </header>

      {/* Stats bar */}
      {stats && (
        <div style={styles.statsBar}>
          <div style={styles.statItem}>
            <span style={styles.statValue}>{stats.totals.posts}</span>
            <span style={styles.statLabel}>posted</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statValue}>
              {stats.totals.clicks.toLocaleString()}
            </span>
            <span style={styles.statLabel}>clicks</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statValue}>{stats.totals.conversions}</span>
            <span style={styles.statLabel}>sales</span>
          </div>
          <div style={styles.statDivider} />
          {Object.entries(stats.by_channel).map(([ch, data]) => (
            <div key={ch} style={styles.statItem}>
              <span style={styles.statValue}>{data.clicks}</span>
              <span style={styles.statLabel}>{ch}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      <div style={styles.main}>
        {/* Pack navigation */}
        {packs.length > 0 && (
          <div style={styles.packNav}>
            <button
              onClick={() =>
                setCurrentPackIndex((i) => Math.max(i - 1, 0))
              }
              disabled={currentPackIndex === 0}
              style={{
                ...styles.navButton,
                opacity: currentPackIndex === 0 ? 0.3 : 1,
              }}
            >
              ←
            </button>
            <span style={styles.packIndicator}>
              {currentPackIndex + 1} / {packs.length}
            </span>
            <button
              onClick={() =>
                setCurrentPackIndex((i) =>
                  Math.min(i + 1, packs.length - 1)
                )
              }
              disabled={currentPackIndex === packs.length - 1}
              style={{
                ...styles.navButton,
                opacity: currentPackIndex === packs.length - 1 ? 0.3 : 1,
              }}
            >
              →
            </button>
          </div>
        )}

        {currentPack ? (
          <div style={styles.packCard}>
            {/* Pack header */}
            <div style={styles.packHeader}>
              <div>
                <h2 style={styles.packName}>{currentPack.name}</h2>
                <p style={styles.packMeta}>
                  {currentPack.slug} · {currentPack.room_name || 'all rooms'} ·{' '}
                  {currentPack.cluster || 'general'}
                </p>
              </div>
              <div style={styles.scoreBox}>
                Score: {currentPack.score}
              </div>
            </div>

            {/* Screenshots */}
            <div style={styles.screenshotSection}>
              <div style={styles.sectionLabel}>Screenshots</div>
              {Object.keys(screenshots).length > 0 ? (
                <div style={styles.screenshotGrid}>
                  {Object.entries(screenshots).map(([format, url]) => (
                    <a
                      key={format}
                      href={url}
                      download={`${currentPack.pack_id}-${format}.png`}
                      target="_blank"
                      rel="noopener"
                      style={styles.screenshotLink}
                    >
                      Download {format}
                    </a>
                  ))}
                </div>
              ) : (
                <button
                  onClick={generateScreenshots}
                  disabled={loadingScreenshots}
                  style={styles.generateButton}
                >
                  {loadingScreenshots
                    ? 'Generating...'
                    : 'Generate Screenshots'}
                </button>
              )}
            </div>

            {/* Captions */}
            <div style={styles.captionSection}>
              <div style={styles.sectionLabel}>Captions</div>
              {currentPack.captions.map((caption, i) => (
                <div key={i} style={styles.captionRow}>
                  <span style={styles.captionText}>{caption}</span>
                  <button
                    onClick={() => copyCaption(caption, i)}
                    style={styles.copyButton}
                  >
                    {copiedCaption === i ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>

            {/* Deploy targets */}
            <div style={styles.targetSection}>
              <div style={styles.sectionLabel}>Deploy Targets</div>
              {currentPack.targets.map((target, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.targetRow,
                    opacity: target.posted ? 0.5 : 1,
                  }}
                >
                  <div style={styles.targetInfo}>
                    <span style={styles.targetChannel}>
                      {target.channel}
                    </span>
                    <span style={styles.targetSurface}>
                      {target.surface}
                    </span>
                  </div>
                  <div style={styles.targetActions}>
                    {target.url && (
                      <a
                        href={target.url}
                        target="_blank"
                        rel="noopener"
                        style={styles.openLink}
                      >
                        Open
                      </a>
                    )}
                    {target.posted ? (
                      <span style={styles.postedBadge}>Posted</span>
                    ) : (
                      <button
                        onClick={() => {
                          const url = prompt('Paste placement URL (optional):')
                          markPosted(i, url || undefined)
                        }}
                        style={styles.postButton}
                      >
                        Mark Posted
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={styles.emptyState}>
            <p>No packs yet. Create one to start deploying.</p>
          </div>
        )}
      </div>

      {/* New Pack Modal */}
      {newPackForm && (
        <PackFormModal
          onSubmit={createPack}
          onClose={() => setNewPackForm(false)}
        />
      )}
    </div>
  )
}

function PackFormModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (data: any) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [roomName, setRoomName] = useState('')
  const [cluster, setCluster] = useState('')
  const [captionsText, setCaptionsText] = useState('')
  const [targetsText, setTargetsText] = useState(
    'reddit|r/nba|https://reddit.com/r/nba\ntwitter|#NBAAllStar|https://twitter.com\ninstagram|basketball edits|https://instagram.com'
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const captions = captionsText
      .split('\n')
      .map((c) => c.trim())
      .filter(Boolean)
    const targets = targetsText
      .split('\n')
      .map((line) => {
        const [channel, surface, url] = line.split('|').map((s) => s.trim())
        return { channel, surface, url, posted: false }
      })
      .filter((t) => t.channel)

    onSubmit({ name, slug, room_name: roomName, cluster, captions, targets })
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>New Deployment Pack</h3>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Pack Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="NBA All-Star 2026"
              style={styles.formInput}
              required
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Footprint Slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="ae"
              style={styles.formInput}
              required
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Room Name (optional)</label>
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="NBA All-Star 2026"
              style={styles.formInput}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Cluster</label>
            <input
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              placeholder="sports"
              style={styles.formInput}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Captions (one per line)</label>
            <textarea
              value={captionsText}
              onChange={(e) => setCaptionsText(e.target.value)}
              placeholder={'LMAOOO had to add this...\nmy footprint is undefeated\nfootprint.onl'}
              style={styles.formTextarea}
              rows={4}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>
              Targets (channel|surface|url, one per line)
            </label>
            <textarea
              value={targetsText}
              onChange={(e) => setTargetsText(e.target.value)}
              style={styles.formTextarea}
              rows={4}
            />
          </div>
          <div style={styles.formActions}>
            <button type="button" onClick={onClose} style={styles.cancelButton}>
              Cancel
            </button>
            <button type="submit" style={styles.submitButton}>
              Create Pack
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Inline styles for the dashboard (no external CSS needed)
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  headerRight: { display: 'flex', gap: '8px' },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    margin: 0,
  },
  packCount: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.4)',
    background: 'rgba(255,255,255,0.08)',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  newPackButton: {
    background: 'rgba(255,255,255,0.1)',
    color: '#F5F5F5',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '6px',
    padding: '6px 14px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  logoutButton: {
    background: 'none',
    color: 'rgba(255,255,255,0.4)',
    border: 'none',
    padding: '6px 10px',
    fontSize: '13px',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  statsBar: {
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
    padding: '16px 20px',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '12px',
    marginBottom: '20px',
    overflowX: 'auto',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    minWidth: '60px',
  },
  statValue: { fontSize: '20px', fontWeight: 700 },
  statLabel: { fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' as const },
  statDivider: {
    width: '1px',
    height: '32px',
    background: 'rgba(255,255,255,0.1)',
  },
  main: {},
  packNav: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '16px',
  },
  navButton: {
    background: 'rgba(255,255,255,0.08)',
    color: '#F5F5F5',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    width: '36px',
    height: '36px',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  packIndicator: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.5)',
  },
  packCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '16px',
    padding: '24px',
  },
  packHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
  },
  packName: { fontSize: '22px', fontWeight: 700, margin: '0 0 4px 0' },
  packMeta: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.4)',
    margin: 0,
  },
  scoreBox: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 600,
  },
  screenshotSection: { marginBottom: '24px' },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: '10px',
  },
  screenshotGrid: { display: 'flex', gap: '8px', flexWrap: 'wrap' as const },
  screenshotLink: {
    background: 'rgba(255,255,255,0.08)',
    color: '#F5F5F5',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  generateButton: {
    background: 'rgba(255,255,255,0.1)',
    color: '#F5F5F5',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '13px',
    cursor: 'pointer',
    width: '100%',
  },
  captionSection: { marginBottom: '24px' },
  captionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '8px',
    marginBottom: '6px',
  },
  captionText: { fontSize: '14px', flex: 1 },
  copyButton: {
    background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.7)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '11px',
    cursor: 'pointer',
    marginLeft: '10px',
    flexShrink: 0,
  },
  targetSection: { marginBottom: '16px' },
  targetRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '8px',
    marginBottom: '6px',
  },
  targetInfo: { display: 'flex', flexDirection: 'column' as const, gap: '2px' },
  targetChannel: { fontSize: '14px', fontWeight: 600 },
  targetSurface: { fontSize: '12px', color: 'rgba(255,255,255,0.4)' },
  targetActions: { display: 'flex', gap: '8px', alignItems: 'center' },
  openLink: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '12px',
    textDecoration: 'none',
    padding: '4px 10px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '4px',
  },
  postButton: {
    background: 'rgba(93,184,122,0.15)',
    color: '#5DB87A',
    border: '1px solid rgba(93,184,122,0.3)',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  postedBadge: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: '12px',
    padding: '4px 10px',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '60px 20px',
    color: 'rgba(255,255,255,0.3)',
  },
  authContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '20px',
  },
  authBox: { textAlign: 'center' as const },
  authTitle: {
    fontSize: '48px',
    fontWeight: 700,
    letterSpacing: '0.2em',
    margin: '0 0 8px',
  },
  authSubtitle: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.4)',
    margin: '0 0 32px',
  },
  authButton: {
    background: 'rgba(255,255,255,0.1)',
    color: '#F5F5F5',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '20px',
  },
  modal: {
    background: '#121316',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '16px',
    padding: '28px',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
  },
  modalTitle: { fontSize: '18px', fontWeight: 700, margin: '0 0 20px' },
  formGroup: { marginBottom: '14px' },
  formLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: '4px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  formInput: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    padding: '8px 12px',
    color: '#F5F5F5',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box' as const,
    outline: 'none',
  },
  formTextarea: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    padding: '8px 12px',
    color: '#F5F5F5',
    fontSize: '13px',
    width: '100%',
    boxSizing: 'border-box' as const,
    outline: 'none',
    fontFamily: 'monospace',
    resize: 'vertical' as const,
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '20px',
  },
  cancelButton: {
    background: 'none',
    color: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  submitButton: {
    background: 'rgba(255,255,255,0.12)',
    color: '#F5F5F5',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '6px',
    padding: '8px 20px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: 600,
  },
}
