'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import SortableGrid from '@/components/SortableGrid'
import AvatarUpload from '@/components/AvatarUpload'
import ThemePicker from '@/components/ThemePicker'
import AnalyticsPanel from '@/components/AnalyticsPanel'
import SharePanel from '@/components/SharePanel'
import { useEditorStore, syncContentOrder } from '@/lib/store'
import { getTheme } from '@/lib/themes'
import type { Content, Footprint } from '@/lib/supabase'

export default function EditorPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const {
    footprints, setFootprints,
    activeFootprint, setActiveFootprint,
    content, setContent, addContent, deleteContent,
    isSaving, setIsSaving,
  } = useEditorStore()

  const [loading, setLoading] = useState(true)
  const [pasteUrl, setPasteUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [currentTheme, setCurrentTheme] = useState('midnight')
  const [showNewRoom, setShowNewRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomIcon, setNewRoomIcon] = useState('◈')
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [showShare, setShowShare] = useState(false)

  useEffect(() => { loadData() }, [slug])

  useEffect(() => {
    if (activeFootprint) {
      setDisplayName(activeFootprint.display_name || '')
      setHandle(activeFootprint.handle || '')
      setBio(activeFootprint.bio || '')
      setAvatarUrl(activeFootprint.avatar_url || null)
      setCurrentTheme((activeFootprint as any).theme || 'midnight')
    }
  }, [activeFootprint])

  useEffect(() => {
    const theme = getTheme(currentTheme)
    const root = document.documentElement
    Object.entries(theme.colors).forEach(([key, value]) => {
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase()
      root.style.setProperty(`--${cssKey}`, value)
    })
  }, [currentTheme])

  async function loadData() {
    try {
      setLoading(true)
      const roomsRes = await fetch('/api/rooms')
      const roomsData = await roomsRes.json()
      if (!roomsRes.ok) throw new Error(roomsData.error)
      setFootprints(roomsData.rooms)
      const active = roomsData.rooms.find((r: Footprint) => r.slug === slug)
      if (!active) {
        if (roomsData.rooms.length > 0) router.replace(`/edit/${roomsData.rooms[0].slug}`)
        return
      }
      setActiveFootprint(active)
      const contentRes = await fetch(`/api/content?footprint_id=${active.id}`)
      const contentData = await contentRes.json()
      if (contentRes.ok) setContent(contentData.content || [])
    } catch (error) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddContent() {
    if (!pasteUrl.trim() || !activeFootprint) return
    setAdding(true)
    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pasteUrl, footprint_id: activeFootprint.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      addContent(data.content)
      setPasteUrl('')
      toast.success('Added!')
    } catch (error) {
      toast.error('Failed to add content')
    } finally {
      setAdding(false)
    }
  }

  async function handleDeleteContent(id: string) {
    deleteContent(id)
    toast.success('Deleted')
    try {
      await fetch(`/api/content?id=${id}`, { method: 'DELETE' })
    } catch {
      loadData()
      toast.error('Failed to delete')
    }
  }

  async function handleReorder(reordered: Content[]) {
    if (!activeFootprint) return
    setContent(reordered)
    try {
      await syncContentOrder(activeFootprint.id, reordered)
    } catch {
      toast.error('Failed to save order')
    }
  }

  async function handleSaveProfile() {
    if (!activeFootprint) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/rooms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeFootprint.id, display_name: displayName, handle, bio }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Saved!')
    } catch {
      toast.error('Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleCreateRoom() {
    if (!newRoomName.trim()) return
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoomName, icon: newRoomIcon }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/edit/${data.room.slug}`)
      setShowNewRoom(false)
      setNewRoomName('')
      toast.success('Room created!')
    } catch {
      toast.error('Failed to create room')
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/${slug}`)
    toast.success('Link copied!')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg,#07080A)]">
        <div className="font-mono text-white/50 animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg,#07080A)] text-[var(--text,#F5F5F5)]">
      {/* SIDEBAR */}
      <aside className="w-80 bg-[var(--bg-alt,#0B0D10)] border-r border-[var(--border)] p-6 flex flex-col sticky top-0 h-screen overflow-y-auto hidden lg:flex">
        <div className="flex items-center justify-between mb-8">
          <span className="font-mono text-xs tracking-widest uppercase text-[var(--text-muted)]">Edit</span>
          <Link href={`/${slug}`} className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text)] bg-[var(--glass)] px-3 py-1.5 rounded">View →</Link>
        </div>

        <div className="space-y-5 mb-8">
          <AvatarUpload currentUrl={avatarUrl} footprintId={activeFootprint?.id || ''} onUpload={setAvatarUrl} />
          
          <div>
            <label className="font-mono text-xs tracking-widest uppercase text-[var(--text-muted)] block mb-2">Name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} onBlur={handleSaveProfile} placeholder="Your name" className="w-full px-4 py-3 bg-[var(--glass)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" />
          </div>

          <div>
            <label className="font-mono text-xs tracking-widest uppercase text-[var(--text-muted)] block mb-2">Handle</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} onBlur={handleSaveProfile} placeholder="@handle" className="w-full px-4 py-3 bg-[var(--glass)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" />
          </div>

          <div>
            <label className="font-mono text-xs tracking-widest uppercase text-[var(--text-muted)] block mb-2">Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} onBlur={handleSaveProfile} placeholder="Say something..." className="w-full px-4 py-3 bg-[var(--glass)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)] resize-none h-20" />
          </div>

          {isSaving && <p className="font-mono text-xs text-[var(--text-muted)]">Saving...</p>}
        </div>

        <div className="mb-8">
          <ThemePicker currentTheme={currentTheme} footprintId={activeFootprint?.id || ''} onSelect={setCurrentTheme} />
        </div>

        <div className="mb-6">
          <button onClick={() => setShowAnalytics(!showAnalytics)} className="flex items-center justify-between w-full font-mono text-xs tracking-widest uppercase text-[var(--text-muted)] hover:text-[var(--text)]">
            <span>Analytics</span>
            <span>{showAnalytics ? '−' : '+'}</span>
          </button>
          {showAnalytics && activeFootprint && <div className="mt-4"><AnalyticsPanel footprintId={activeFootprint.id} /></div>}
        </div>

        <div className="mb-6">
          <button onClick={() => setShowShare(!showShare)} className="flex items-center justify-between w-full font-mono text-xs tracking-widest uppercase text-[var(--text-muted)] hover:text-[var(--text)]">
            <span>Share & Export</span>
            <span>{showShare ? '−' : '+'}</span>
          </button>
          {showShare && activeFootprint && <div className="mt-4"><SharePanel slug={slug} footprintId={activeFootprint.id} /></div>}
        </div>

        <div className="mt-auto pt-6 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-xs tracking-widest uppercase text-[var(--text-muted)]">Rooms</span>
            <button onClick={() => setShowNewRoom(true)} className="text-[var(--text-muted)] hover:text-[var(--text)] text-xl">+</button>
          </div>
          <div className="space-y-2">
            {footprints.map((room) => (
              <Link key={room.id} href={`/edit/${room.slug}`} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${room.slug === slug ? 'bg-[var(--accent)] text-[var(--bg)]' : 'bg-[var(--glass)] hover:bg-[var(--glass-hover)]'}`}>
                <span>{room.icon}</span>
                <span className="text-sm flex-1 truncate">{room.name}</span>
                <span className="font-mono text-xs opacity-50">{(room as any).content_count || 0}</span>
              </Link>
            ))}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-6 lg:p-8">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <h1 className="text-2xl font-normal">{activeFootprint?.name || 'Untitled'}</h1>
          <div className="flex items-center gap-3">
            <div className="bg-[var(--glass)] border border-[var(--border)] rounded-lg px-4 py-2 flex items-center gap-3">
              <span className="font-mono text-sm text-[var(--text-muted)] truncate max-w-[200px]">{typeof window !== 'undefined' ? window.location.origin : ''}/{slug}</span>
              <button onClick={copyLink} className="font-mono text-xs bg-[var(--accent)] text-[var(--bg)] px-3 py-1 rounded">Copy</button>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="relative">
            <input type="text" value={pasteUrl} onChange={(e) => setPasteUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddContent()} placeholder="Paste any URL..." className="w-full px-6 py-5 pr-24 bg-[var(--glass)] border-2 border-dashed border-[var(--border)] rounded-2xl font-mono text-sm focus:border-[var(--accent)] focus:border-solid focus:outline-none" />
            <button onClick={handleAddContent} disabled={adding || !pasteUrl.trim()} className="absolute right-3 top-1/2 -translate-y-1/2 bg-[var(--accent)] text-[var(--bg)] py-2.5 px-5 rounded-lg font-mono text-xs disabled:opacity-50">{adding ? '...' : 'Add'}</button>
          </div>
          <p className="font-mono text-xs text-[var(--text-muted)] text-center mt-3">YouTube, Spotify, Twitter, images, articles — anything</p>
        </div>

        <SortableGrid items={content} onReorder={handleReorder} onDelete={handleDeleteContent} />
      </main>

      {/* NEW ROOM MODAL */}
      {showNewRoom && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50">
          <div className="bg-[var(--bg-alt)] border border-[var(--border)] rounded-2xl p-8 w-full max-w-md">
            <h2 className="text-xl font-normal mb-6">New Room</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className="font-mono text-xs tracking-widest uppercase text-[var(--text-muted)] block mb-2">Icon</label>
                <div className="flex gap-2 flex-wrap">
                  {['◈', '♫', '◎', '⚡', '✦', '◆', '●', '■', '♦', '★'].map((icon) => (
                    <button key={icon} onClick={() => setNewRoomIcon(icon)} className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${newRoomIcon === icon ? 'bg-[var(--accent)] text-[var(--bg)]' : 'bg-[var(--glass)] hover:bg-[var(--glass-hover)]'}`}>{icon}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="font-mono text-xs tracking-widest uppercase text-[var(--text-muted)] block mb-2">Name</label>
                <input type="text" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="Music, Work, Chaos..." className="w-full px-4 py-3 bg-[var(--glass)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--accent)]" autoFocus />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowNewRoom(false)} className="flex-1 py-3 bg-[var(--glass)] border border-[var(--border)] rounded-lg font-mono text-sm">Cancel</button>
              <button onClick={handleCreateRoom} disabled={!newRoomName.trim()} className="flex-1 py-3 bg-[var(--accent)] text-[var(--bg)] rounded-lg font-mono text-sm disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
