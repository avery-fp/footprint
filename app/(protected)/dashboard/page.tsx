'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Room {
  id: string
  slug: string
  name: string
  icon: string
  is_primary: boolean
  hidden: boolean
  content_count: number
  view_count: number
}

interface UserData {
  serial_number: number
  email: string
  has_password?: boolean
}

const DM = "'DM Sans', sans-serif"

function Sparkline({ data, color = 'rgba(255,255,255,0.3)' }: { data: number[]; color?: string }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const points = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * 80
    const y = 24 - (v / max) * 20
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width="80" height="24" viewBox="0 0 80 24" className="opacity-60">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function DashboardPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<UserData | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [showPasswordSetup, setShowPasswordSetup] = useState(false)
  const [password, setPassword] = useState('')
  const [settingPassword, setSettingPassword] = useState(false)

  const [visitsSpark, setVisitsSpark] = useState<number[]>([])
  const [clicksSpark, setClicksSpark] = useState<number[]>([])
  const [referralCount, setReferralCount] = useState(0)
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const userRes = await fetch('/api/user')
      const userData = await userRes.json()

      if (userRes.ok) {
        setUser(userData.user)
        if (!userData.user.has_password) setShowPasswordSetup(true)
        fetchAnalytics()
      }

      const roomsRes = await fetch('/api/rooms')
      const roomsData = await roomsRes.json()
      if (roomsRes.ok) {
        setRooms(roomsData.rooms)

        const primary = roomsData.rooms.find((r: Room) => r.is_primary)
        if (primary) {
          fetch(`/api/share?slug=${primary.slug}`)
            .then(r => r.json())
            .then(d => {
              if (d.referral_count !== undefined) setReferralCount(d.referral_count)
              if (d.share_url) setShareUrl(d.share_url)
            })
            .catch(() => {})
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  async function fetchAnalytics() {
    try {
      const res = await fetch('/api/aro-feed')
      if (!res.ok) return
      const data = await res.json()

      if (data.daily) {
        const visits: number[] = []
        const clicks: number[] = []
        const days = data.daily.slice(-7)
        for (const d of days) {
          visits.push(d.visits || 0)
          clicks.push(d.tile_clicks || 0)
        }
        setVisitsSpark(visits)
        setClicksSpark(clicks)
      }
    } catch {
      // analytics optional
    }
  }

  async function handleDeleteRoom(roomId: string, roomName: string) {
    if (deletingIds.has(roomId)) return
    if (!confirm(`Delete "${roomName}"? This cannot be undone.`)) return

    setDeletingIds(prev => new Set(prev).add(roomId))
    try {
      const res = await fetch(`/api/rooms?id=${roomId}`, { method: 'DELETE' })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Delete failed')
      }
      setRooms(prev => prev.filter(r => r.id !== roomId))
      toast.success('Page deleted')
    } catch (error) {
      toast.error(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev)
        next.delete(roomId)
        return next
      })
    }
  }

  async function toggleHidden(roomId: string, currentlyHidden: boolean) {
    try {
      const res = await fetch('/api/rooms/visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hidden: !currentlyHidden }),
      })
      if (!res.ok) throw new Error('Failed')
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, hidden: !currentlyHidden } : r))
      toast.success(currentlyHidden ? 'Room visible' : 'Room hidden')
    } catch {
      toast.error('Failed to update')
    }
  }

  const totalViews = rooms.reduce((sum, room) => sum + (room.view_count || 0), 0)
  const totalContent = rooms.reduce((sum, room) => sum + (room.content_count || 0), 0)
  const primaryRoom = rooms.find(r => r.is_primary)

  async function handleSetPassword() {
    if (!password || password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setSettingPassword(true)
    try {
      const res = await fetch('/api/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        setShowPasswordSetup(false)
        toast.success('Password set')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to set password')
      }
    } catch {
      toast.error('Failed')
    } finally {
      setSettingPassword(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 lg:p-12">

      {showPasswordSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#111] border border-white/10 rounded-2xl p-8">
            <p className="text-xl font-light mb-2 text-white/90">create a password</p>
            <p className="text-sm text-white/30 mb-6">so you can sign in anytime</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/15 text-sm mb-4"
              autoFocus
            />
            <button
              onClick={handleSetPassword}
              disabled={settingPassword || password.length < 6}
              className="w-full py-3 rounded-xl bg-white text-black text-sm font-medium hover:bg-white/90 transition-all disabled:opacity-30"
            >
              {settingPassword ? '...' : 'set password'}
            </button>
            <button
              onClick={() => setShowPasswordSetup(false)}
              className="w-full mt-3 text-white/20 text-xs hover:text-white/40 transition-colors"
            >
              skip for now
            </button>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-12">
          <Link href="/" className="font-mono text-sm tracking-widest uppercase text-white/50">
            Footprint
          </Link>
          <button
            onClick={() => {
              document.cookie = 'session=; Max-Age=0; path=/'
              router.push('/')
            }}
            className="font-mono text-xs text-white/40 hover:text-white/60 transition-colors"
          >
            Sign out
          </button>
        </header>

        {/* Serial + Deed link */}
        <div className="text-center mb-16">
          <p className="font-mono text-xs tracking-widest uppercase text-white/40 mb-4">
            Your Serial Number
          </p>
          <Link href={user ? `/deed/${user.serial_number}` : '#'} className="group inline-block">
            <h1 className="text-6xl md:text-8xl font-light tracking-tight mb-2 group-hover:text-white/80 transition-colors">
              #{user?.serial_number?.toLocaleString() || '----'}
            </h1>
            <p className="text-white/20 text-xs group-hover:text-white/40 transition-colors">
              view your deed
            </p>
          </Link>
          <p className="text-white/50 mt-3">
            This number is yours. It can never be purchased again.
          </p>
        </div>

        {/* 4-stat grid with sparklines */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="glass rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-2xl font-light">{totalViews}</p>
              <Sparkline data={visitsSpark} />
            </div>
            <p className="font-mono text-xs text-white/40 uppercase tracking-wider">Visits</p>
          </div>
          <div className="glass rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-2xl font-light">{totalContent}</p>
              <Sparkline data={clicksSpark} color="rgba(255,255,255,0.25)" />
            </div>
            <p className="font-mono text-xs text-white/40 uppercase tracking-wider">Tile Clicks</p>
          </div>
          <div className="glass rounded-xl p-5">
            <p className="text-2xl font-light mb-3">{referralCount}</p>
            <p className="font-mono text-xs text-white/40 uppercase tracking-wider">Referrals</p>
          </div>
          <div className="glass rounded-xl p-5">
            <p className="text-2xl font-light mb-3">{rooms.length}</p>
            <p className="font-mono text-xs text-white/40 uppercase tracking-wider">Rooms</p>
          </div>
        </div>

        {/* Share section */}
        {shareUrl && (
          <div className="glass rounded-xl p-4 flex items-center gap-3 mb-12">
            <p className="font-mono text-xs text-white/30 flex-shrink-0">Share:</p>
            <p className="font-mono text-sm text-white/40 truncate flex-1">{shareUrl}</p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareUrl)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className={`px-4 py-2 text-xs rounded-lg flex-shrink-0 transition ${
                copied ? 'bg-green-500/80 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        {/* Empty state */}
        {rooms.length === 0 && !loading && (
          <div className="text-center py-20">
            <p className="text-white/15 text-sm mb-6" style={{ fontFamily: DM }}>
              share your footprint to see stats here
            </p>
            <Link
              href="/build"
              className="inline-block rounded-xl px-6 py-3 bg-white/10 text-white/60 text-sm hover:bg-white/15 transition"
            >
              Set up your room
            </Link>
          </div>
        )}

        {/* Quick Actions */}
        {rooms.length > 0 && (
          <div className="flex gap-4 justify-center mb-12">
            {primaryRoom && (
              <Link href={`/${primaryRoom.slug}/home`} className="btn-primary rounded-lg">
                Edit your Footprint
              </Link>
            )}
            <Link
              href={primaryRoom ? `/${primaryRoom.slug}` : '/'}
              className="btn-primary bg-transparent border border-white/20 text-paper rounded-lg"
            >
              View public page
            </Link>
          </div>
        )}

        {/* Rooms Grid */}
        {rooms.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-mono text-xs tracking-widest uppercase text-white/40">Your Rooms</h2>
              <Link
                href={primaryRoom ? `/${primaryRoom.slug}/home` : '/'}
                className="font-mono text-xs text-white/40 hover:text-paper transition-colors"
              >
                + New room
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className={`relative glass rounded-xl p-6 transition-all ${room.hidden ? 'opacity-40' : ''} ${deletingIds.has(room.id) ? 'opacity-20' : ''}`}
                >
                  <Link href={`/${room.slug}/home`} className="block glass-hover card-hover group">
                    <div className="flex items-start justify-between mb-4">
                      <span className="text-3xl">{room.icon}</span>
                      <div className="flex items-center gap-2">
                        {room.is_primary && <span className="font-mono text-xs text-white/30 uppercase">Primary</span>}
                        {room.hidden && <span className="font-mono text-xs text-white/20 uppercase">Hidden</span>}
                      </div>
                    </div>
                    <h3 className="text-lg font-medium mb-2">{room.name}</h3>
                    <div className="flex gap-4 font-mono text-xs text-white/40">
                      <span>{room.content_count || 0} items</span>
                      <span>{room.view_count || 0} views</span>
                    </div>
                    <div className="mt-4 flex items-center text-white/40 group-hover:text-paper transition-colors">
                      <span className="font-mono text-sm">Edit</span>
                      <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                  </Link>
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    <button
                      onClick={(e) => { e.preventDefault(); toggleHidden(room.id, room.hidden) }}
                      className="text-white/20 hover:text-white/60 transition-colors"
                      title={room.hidden ? 'Show room' : 'Hide room'}
                    >
                      {room.hidden ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <footer className="text-center pt-12 border-t border-white/10">
          <p className="font-mono text-xs text-white/25">{user?.email}</p>
        </footer>
      </div>
    </div>
  )
}
