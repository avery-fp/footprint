'use client'

import { useState, useRef, useEffect } from 'react'
import { audioManager } from '@/lib/audio-manager'

export default function VideoTile({ src }: { src: string }) {
  const [isMuted, setIsMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoId = useRef(`video-${src}-${Math.random()}`).current

  // Register with audio manager
  useEffect(() => {
    audioManager.register(videoId, () => {
      if (videoRef.current) {
        videoRef.current.muted = true
        setIsMuted(true)
      }
    })
    return () => audioManager.unregister(videoId)
  }, [videoId])

  const handleClick = () => {
    if (videoRef.current) {
      if (isMuted) {
        // Unmute this, mute all others
        audioManager.play(videoId)
        videoRef.current.muted = false
        setIsMuted(false)
      } else {
        // Mute this
        audioManager.mute(videoId)
        videoRef.current.muted = true
        setIsMuted(true)
      }
    }
  }

  return (
    <div className="relative group">
      <video
        ref={videoRef}
        src={src}
        className="w-full aspect-video min-h-[300px] object-cover rounded-xl cursor-pointer"
        autoPlay
        muted
        loop
        playsInline
        onClick={handleClick}
      />
      {!isMuted && (
        <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60"></div>
      )}
    </div>
  )
}
