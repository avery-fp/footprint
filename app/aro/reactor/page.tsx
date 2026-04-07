'use client'

import { useState, useEffect, useCallback } from 'react'
import { AUTH_ENTRY } from '@/lib/routes'

interface JobSummary {
  id: string
  status: string
  targets_found: number
  comments_gen: number
  seeds_queued: number
  errors: string[]
  started_at: string
  completed_at: string | null
}

interface ReactorState {
  active: boolean
  lights: {
    alive: boolean
    spreading: boolean
    reward: boolean
  }
  recentJobs: JobSummary[]
}

export default function ReactorPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [state, setState] = useState<ReactorState | null>(null)
  const [toggling, setToggling] = useState(false)

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/aro/reactor', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setState(data)
        setAuthenticated(true)
      } else {
        setAuthenticated(false)
      }
    } catch {
      setAuthenticated(false)
    }
  }, [])

  useEffect(() => {
    fetchState()
  }, [fetchState])

  // Auto-refresh every 10s
  useEffect(() => {
    if (!authenticated) return
    const interval = setInterval(fetchState, 10000)
    return () => clearInterval(interval)
  }, [authenticated, fetchState])

  const toggle = async () => {
    if (!state || toggling) return
    setToggling(true)

    try {
      const action = state.active ? 'pause' : 'ignite'
      const res = await fetch('/api/aro/reactor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      })

      if (res.ok) {
        const data = await res.json()
        setState(data)
      }
    } catch {
      // ignore
    }

    setToggling(false)
  }

  // ─── Loading ────────────────────────────────────────
  if (authenticated === null) {
    return (
      <div style={s.center}>
        <div style={s.authBox}>
          <h1 style={s.logo}>REACTOR</h1>
          <p style={s.sub}>verifying session...</p>
        </div>
      </div>
    )
  }

  // ─── Not authenticated ──────────────────────────────
  if (!authenticated) {
    return (
      <div style={s.center}>
        <div style={s.authBox}>
          <h1 style={s.logo}>REACTOR</h1>
          <p style={s.sub}>admin session required</p>
          <a href={AUTH_ENTRY} style={s.loginLink}>Sign in</a>
        </div>
      </div>
    )
  }

  const lights = state?.lights || { alive: false, spreading: false, reward: false }
  const jobs = state?.recentJobs || []
  const isActive = state?.active ?? false

  return (
    <div style={s.container}>
      {/* Header */}
      <header style={s.header}>
        <h1 style={s.title}>REACTOR</h1>
        <a href="/aro" style={s.backLink}>Dashboard</a>
      </header>

      {/* Status lights */}
      <div style={s.lightsRow}>
        <Light label="ALIVE" on={lights.alive} color="#5DB87A" />
        <Light label="SPREADING" on={lights.spreading} color="#E8A838" />
        <Light label="REWARD" on={lights.reward} color="#7B68EE" />
      </div>

      {/* Ignite / Pause button */}
      <div style={s.buttonRow}>
        <button
          onClick={toggle}
          disabled={toggling}
          style={{
            ...s.mainButton,
            background: isActive
              ? 'rgba(220, 60, 60, 0.15)'
              : 'rgba(93, 184, 122, 0.15)',
            borderColor: isActive
              ? 'rgba(220, 60, 60, 0.4)'
              : 'rgba(93, 184, 122, 0.4)',
            color: isActive ? '#DC3C3C' : '#5DB87A',
          }}
        >
          {toggling ? '...' : isActive ? 'PAUSE' : 'IGNITE'}
        </button>
      </div>

      {/* Reactor state log */}
      <div style={s.logSection}>
        <div style={s.logHeader}>
          <span style={s.sectionLabel}>REACTOR STATE</span>
          <span style={s.logCount}>{jobs.length} entries</span>
        </div>
        <div style={s.logWindow}>
          {jobs.length === 0 ? (
            <div style={s.emptyLog}>No cycles recorded yet.</div>
          ) : (
            jobs.map((job) => (
              <LogEntry key={job.id} job={job} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Components ──────────────────────────────────────

function Light({ label, on, color }: { label: string; on: boolean; color: string }) {
  return (
    <div style={s.lightItem}>
      <div
        style={{
          ...s.lightDot,
          background: on ? color : 'rgba(255,255,255,0.08)',
          boxShadow: on ? `0 0 12px ${color}40` : 'none',
        }}
      />
      <span style={{ ...s.lightLabel, color: on ? color : 'rgba(255,255,255,0.3)' }}>
        {label}
      </span>
    </div>
  )
}

function LogEntry({ job }: { job: JobSummary }) {
  const ts = new Date(job.started_at)
  const time = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const statusColor =
    job.status === 'completed' ? '#5DB87A' :
    job.status === 'failed' ? '#DC3C3C' :
    '#E8A838'

  return (
    <div style={s.logEntry}>
      <span style={s.logTime}>{date} {time}</span>
      <span style={{ ...s.logStatus, color: statusColor }}>
        {job.status.toUpperCase()}
      </span>
      <span style={s.logMetric}>
        {job.targets_found}t {job.comments_gen}c {job.seeds_queued}s
      </span>
      {job.errors.length > 0 && (
        <span style={s.logErrors}>
          {job.errors.length} err
        </span>
      )}
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '640px',
    margin: '0 auto',
    padding: '24px 20px',
    minHeight: '100vh',
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '20px',
  },
  authBox: { textAlign: 'center' },
  logo: {
    fontSize: '48px',
    fontWeight: 700,
    letterSpacing: '0.2em',
    margin: '0 0 8px',
  },
  sub: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.4)',
    margin: '0 0 24px',
  },
  loginLink: {
    color: '#F5F5F5',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    padding: '10px 24px',
    fontSize: '14px',
    textDecoration: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
    paddingBottom: '16px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    letterSpacing: '0.15em',
    margin: 0,
  },
  backLink: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: '13px',
    textDecoration: 'none',
  },
  lightsRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '40px',
    marginBottom: '32px',
  },
  lightItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  lightDot: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    transition: 'all 0.3s ease',
  },
  lightLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.15em',
    transition: 'color 0.3s ease',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '40px',
  },
  mainButton: {
    width: '200px',
    height: '52px',
    border: '1px solid',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: 700,
    letterSpacing: '0.15em',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  logSection: {},
  logHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: 'rgba(255,255,255,0.4)',
  },
  logCount: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.25)',
  },
  logWindow: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px',
    padding: '4px 0',
    maxHeight: '480px',
    overflowY: 'auto',
    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
  },
  emptyLog: {
    padding: '24px',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.2)',
    fontSize: '13px',
  },
  logEntry: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
    fontSize: '12px',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
  },
  logTime: {
    color: 'rgba(255,255,255,0.3)',
    flexShrink: 0,
    width: '100px',
  },
  logStatus: {
    fontWeight: 600,
    flexShrink: 0,
    width: '80px',
  },
  logMetric: {
    color: 'rgba(255,255,255,0.5)',
    flex: 1,
  },
  logErrors: {
    color: '#DC3C3C',
    fontSize: '11px',
    flexShrink: 0,
  },
}
