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
  content_count: number
  view_count: number
}

interface UserData {
  serial_number: number
  email: string
  has_password?: boolean
}

/**
 * Dashboard Page
 * 
 * The user's home base. Shows:
 * - Their serial number (the flex)
 * - All their rooms
 * - Quick stats
 * - Quick actions
 * 
 * From here they can:
 * - Jump into any room to edit
 * - Create new rooms
 * - View their public profile
 */
export default function DashboardPage() {
  const router = useRouter()
  
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<UserData | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [showPasswordSetup, setShowPasswordSetup] = useState(false)
  const [password, setPassword] = useState('')
  const [settingPassword, setSettingPassword] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      // Fetch user data
      const userRes = await fetch('/api/user')
      const userData = await userRes.json()
      
      if (userRes.ok) {
        setUser(userData.user)
        if (!userData.user.has_password) setShowPasswordSetup(true)
      }

      // Fetch rooms
      const roomsRes = await fetch('/api/rooms')
      const roomsData = await roomsRes.json()
      
      if (roomsRes.ok) {
        setRooms(roomsData.rooms)
      }

    } catch (error) {
      console.error('Failed to load:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteRoom(roomId: string, roomName: string) {
    if (deletingIds.has(roomId)) return

    if (!confirm(`Delete "${roomName}"? This cannot be undone.`)) {
      return
    }

    setDeletingIds(prev => new Set(prev).add(roomId))

    try {
      const res = await fetch(`/api/rooms?id=${roomId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Delete failed')
      }

      // Remove from local state
      setRooms(prev => prev.filter(r => r.id !== roomId))
      toast.success('Page deleted')

    } catch (error) {
      console.error('Failed to delete room:', error)
      toast.error(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev)
        next.delete(roomId)
        return next
      })
    }
  }

  // Calculate total stats
  const totalViews = rooms.reduce((sum, room) => sum + (room.view_count || 0), 0)
  const totalContent = rooms.reduce((sum, room) => sum + (room.content_count || 0), 0)

  // Get primary room for quick link
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
        <div className="font-mono text-white/50 animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 lg:p-12">

      {/* Password setup — first visit only */}
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
        {/* Header */}
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

        {/* Serial Number Hero */}
        <div className="text-center mb-16">
          <p className="font-mono text-xs tracking-widest uppercase text-white/40 mb-4">
            Your Serial Number
          </p>
          <h1 className="text-6xl md:text-8xl font-light tracking-tight mb-4">
            #{user?.serial_number?.toLocaleString() || '----'}
          </h1>
          <p className="text-white/50">
            This number is yours. It can never be purchased again.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          <div className="glass rounded-xl p-6 text-center">
            <p className="text-3xl font-light mb-2">{rooms.length}</p>
            <p className="font-mono text-xs text-white/40 uppercase tracking-wider">Rooms</p>
          </div>
          <div className="glass rounded-xl p-6 text-center">
            <p className="text-3xl font-light mb-2">{totalContent}</p>
            <p className="font-mono text-xs text-white/40 uppercase tracking-wider">Items</p>
          </div>
          <div className="glass rounded-xl p-6 text-center">
            <p className="text-3xl font-light mb-2">{totalViews}</p>
            <p className="font-mono text-xs text-white/40 uppercase tracking-wider">Views</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-4 justify-center mb-12">
          {primaryRoom && (
            <Link
              href={`/edit/${primaryRoom.slug}`}
              className="btn-primary rounded-lg"
            >
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

        {/* Rooms Grid */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-mono text-xs tracking-widest uppercase text-white/40">
              Your Rooms
            </h2>
            <Link
              href={primaryRoom ? `/edit/${primaryRoom.slug}` : '/'}
              className="font-mono text-xs text-white/40 hover:text-paper transition-colors"
            >
              + New room
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <div
                key={room.id}
                className={`relative glass rounded-xl p-6 transition-all ${deletingIds.has(room.id) ? 'opacity-50' : ''}`}
              >
                <Link
                  href={`/edit/${room.slug}`}
                  className="block glass-hover card-hover group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-3xl">{room.icon}</span>
                    {room.is_primary && (
                      <span className="font-mono text-xs text-white/30 uppercase">Primary</span>
                    )}
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
                {!room.is_primary && (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      handleDeleteRoom(room.id, room.name)
                    }}
                    disabled={deletingIds.has(room.id)}
                    className="absolute top-3 right-3 text-white/20 hover:text-red-400 transition-colors disabled:opacity-50"
                    title="Delete page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center pt-12 border-t border-white/10">
          <p className="font-mono text-xs text-white/25">
            {user?.email}
          </p>
        </footer>
      </div>
    </div>
  )
}
