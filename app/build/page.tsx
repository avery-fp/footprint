'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import TemplatePicker from '@/components/TemplatePicker'

interface UserData {
  id: string
  email: string
  serial_number: number
}

interface FootprintData {
  id: string
  slug: string
  name: string
  display_name: string | null
  bio: string | null
}

export default function BuildPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<UserData | null>(null)
  const [footprint, setFootprint] = useState<FootprintData | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [firstLink, setFirstLink] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [step, setStep] = useState<'profile' | 'content' | 'done'>('profile')
  const [selectedTemplate, setSelectedTemplate] = useState('minimal')

  useEffect(() => {
    async function load() {
      try {
        const userRes = await fetch('/api/user')
        if (!userRes.ok) {
          router.push('/checkout')
          return
        }
        const userData = await userRes.json()
        setUser(userData.user)

        const roomsRes = await fetch('/api/rooms')
        const roomsData = await roomsRes.json()
        if (roomsData.rooms?.length > 0) {
          const primary = roomsData.rooms.find((r: any) => r.is_primary) || roomsData.rooms[0]
          setFootprint(primary)
          if (primary.display_name) setDisplayName(primary.display_name)
          if (primary.bio) setBio(primary.bio)
        }
      } catch {
        router.push('/checkout')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  async function handleProfileSave() {
    if (!footprint) return
    setSaving(true)
    try {
      const res = await fetch(`/api/rooms`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: footprint.id,
          display_name: displayName,
          bio,
          dimension: selectedTemplate,
        }),
      })
      if (res.ok) {
        setStep('content')
      } else {
        toast.error('Failed to save')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddLink() {
    if (!footprint || !firstLink.trim()) {
      setStep('done')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          footprint_id: footprint.id,
          url: firstLink.trim(),
        }),
      })
      if (res.ok) {
        setStep('done')
      } else {
        toast.error('Could not add that link')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  function goLive() {
    if (footprint) {
      router.push(`/${footprint.slug}/home`)
    } else {
      router.push('/build')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>
        <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      <div className="w-full max-w-md">
        {/* Serial badge */}
        {user && (
          <div className="text-center mb-10">
            <p className="font-mono text-xs text-white/30 tracking-widest uppercase mb-2">
              footprint
            </p>
            <p
              className="text-white/20 text-sm"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              #{user.serial_number.toLocaleString()}
            </p>
          </div>
        )}

        {/* Step 1: Profile */}
        {step === 'profile' && (
          <div className="animate-fade-up">
            <h2
              className="text-2xl text-white mb-1 text-center"
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, letterSpacing: '-0.02em' }}
            >
              Make it yours
            </h2>
            <p
              className="text-white/30 text-sm text-center mb-8"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              You can change everything later.
            </p>

            <div className="space-y-4">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="your name"
                autoFocus
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/20 text-sm transition-colors"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              />

              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="a short bio (optional)"
                rows={3}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/20 text-sm transition-colors resize-none"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              />

              <TemplatePicker
                selected={selectedTemplate}
                onSelect={(t) => setSelectedTemplate(t.id)}
              />

              <button
                onClick={handleProfileSave}
                disabled={saving}
                className="w-full rounded-xl px-4 py-3.5 bg-white text-black/90 hover:bg-white/90 transition-all disabled:opacity-30 text-sm font-medium"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {saving ? '...' : 'Next'}
              </button>

              <button
                onClick={() => setStep('content')}
                className="w-full text-white/20 text-xs hover:text-white/40 transition-colors py-2"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                skip
              </button>
            </div>
          </div>
        )}

        {/* Step 2: First content */}
        {step === 'content' && (
          <div className="animate-fade-up">
            <h2
              className="text-2xl text-white mb-1 text-center"
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, letterSpacing: '-0.02em' }}
            >
              Add your first thing
            </h2>
            <p
              className="text-white/30 text-sm text-center mb-8"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              Paste any link. YouTube, Spotify, Instagram, anything.
            </p>

            <div className="space-y-4">
              <input
                type="url"
                value={firstLink}
                onChange={(e) => setFirstLink(e.target.value)}
                placeholder="paste a link"
                autoFocus
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/20 text-sm transition-colors"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              />

              <button
                onClick={handleAddLink}
                disabled={saving}
                className="w-full rounded-xl px-4 py-3.5 bg-white text-black/90 hover:bg-white/90 transition-all disabled:opacity-30 text-sm font-medium"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {saving ? '...' : firstLink.trim() ? 'Add & continue' : 'Skip for now'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Done — share moment */}
        {step === 'done' && (
          <div className="animate-fade-up text-center">
            <div className="w-16 h-16 rounded-full bg-green-400 flex items-center justify-center mx-auto mb-6">
              <span className="text-3xl text-black">✓</span>
            </div>

            <h2
              className="text-2xl text-white mb-2"
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, letterSpacing: '-0.02em' }}
            >
              Your room is ready
            </h2>

            {footprint && (
              <p className="font-mono text-white/30 text-xs mb-6">
                footprint.onl/{footprint.slug}
              </p>
            )}

            {/* Share CTA — the lateral fire moment */}
            {footprint && user && (
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 mb-6">
                <p
                  className="text-white/40 text-xs mb-3"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  Share it. Every click counts.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/${footprint.slug}?ref=FP-${user.serial_number}`
                      navigator.clipboard.writeText(url)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-all ${
                      copied ? 'bg-green-500 text-white' : 'bg-white/10 hover:bg-white/15 text-white/70'
                    }`}
                    style={{ fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {copied ? 'Copied!' : 'Copy share link'}
                  </button>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/${footprint.slug}?ref=FP-${user.serial_number}`
                      if (navigator.share) {
                        navigator.share({ title: 'My Footprint', url }).catch(() => {})
                      } else {
                        navigator.clipboard.writeText(url)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                      }
                    }}
                    className="flex-1 py-2.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white/70 transition-all"
                    style={{ fontFamily: "'DM Sans', sans-serif" }}
                  >
                    Share
                  </button>
                </div>
                <p className="font-mono text-white/15 text-[10px] mt-2">
                  ref: FP-{user.serial_number}
                </p>
              </div>
            )}

            <button
              onClick={goLive}
              className="w-full rounded-xl px-4 py-3.5 bg-white text-black/90 hover:bg-white/90 transition-all text-sm font-medium mb-3"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              Start building
            </button>

            {footprint && (
              <a
                href={`/${footprint.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-white/20 text-xs hover:text-white/40 transition-colors"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                preview your page
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
