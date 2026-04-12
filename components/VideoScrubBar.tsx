'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

interface VideoScrubBarProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function VideoScrubBar({ videoRef }: VideoScrubBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [isTrackHovered, setIsTrackHovered] = useState(false)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoverTime, setHoverTime] = useState(0)

  // rAF loop — read video time
  useEffect(() => {
    const tick = () => {
      const v = videoRef.current
      if (v && v.duration > 0 && !isScrubbing) {
        setProgress(v.currentTime / v.duration)
        setCurrentTime(v.currentTime)
        setDuration(v.duration)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [videoRef, isScrubbing])

  const seekToFraction = useCallback((fraction: number) => {
    const v = videoRef.current
    if (!v || !v.duration) return
    const clamped = Math.max(0, Math.min(1, fraction))
    v.currentTime = clamped * v.duration
    setProgress(clamped)
    setCurrentTime(clamped * v.duration)
  }, [videoRef])

  const getFraction = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    return (clientX - rect.left) / rect.width
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsScrubbing(true)
    const frac = getFraction(e.clientX)
    seekToFraction(frac)
    trackRef.current?.setPointerCapture(e.pointerId)
  }, [getFraction, seekToFraction])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const frac = getFraction(e.clientX)
    if (isScrubbing) {
      seekToFraction(frac)
    }
    // Hover time label
    const track = trackRef.current
    if (track) {
      const rect = track.getBoundingClientRect()
      setHoverX(e.clientX - rect.left)
      setHoverTime(Math.max(0, frac) * (videoRef.current?.duration || 0))
    }
  }, [isScrubbing, getFraction, seekToFraction, videoRef])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    setIsScrubbing(false)
  }, [])

  const onPointerEnter = useCallback(() => {
    setIsTrackHovered(true)
  }, [])

  const onPointerLeave = useCallback(() => {
    setHoverX(null)
    setIsTrackHovered(false)
  }, [])

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-10"
      style={{ touchAction: 'none' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Hover time label */}
      {hoverX !== null && duration > 0 && (
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: '28px',
            left: `${hoverX}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <span
            className="font-mono text-white/80 px-1.5 py-0.5 rounded"
            style={{
              fontSize: '10px',
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {formatTime(hoverTime)}
          </span>
        </div>
      )}

      {/* Elapsed / remaining */}
      {duration > 0 && (
        <div
          className="flex justify-between px-3 pb-1 pointer-events-none"
          style={{ fontSize: '10px' }}
        >
          <span className="font-mono text-white/50">{formatTime(currentTime)}</span>
          <span className="font-mono text-white/30">{formatTime(duration)}</span>
        </div>
      )}

      {/* Track — 32px hit target, 2px visual bar */}
      <div
        ref={trackRef}
        className="relative w-full flex items-end cursor-pointer"
        style={{ height: '24px', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        {/* Visual track */}
        <div
          className="w-full relative overflow-hidden transition-[height] duration-150"
          style={{ height: (isScrubbing || isTrackHovered) ? '4px' : '2px' }}
        >
          {/* Background */}
          <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.15)' }} />
          {/* Fill */}
          <div
            className="absolute top-0 left-0 h-full"
            style={{
              width: `${progress * 100}%`,
              background: 'rgba(255,255,255,0.8)',
              transition: isScrubbing ? 'none' : 'width 0.1s linear',
            }}
          />
        </div>
      </div>
    </div>
  )
}
