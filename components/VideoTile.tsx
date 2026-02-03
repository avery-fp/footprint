'use client'

import { useState, useRef } from 'react'

export default function VideoTile({ src }: { src: string }) {
  const [isMuted, setIsMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleClick = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  return (
    <div className="relative group">
      <video
        ref={videoRef}
        src={src}
        className="w-full aspect-video object-cover rounded-2xl cursor-pointer"
        autoPlay
        muted
        loop
        playsInline
        onClick={handleClick}
      />
      {!isMuted && (
        <div className="absolute bottom-3 right-3 text-white/60 text-xs font-mono bg-black/50 px-2 py-1 rounded">
          🔊
        </div>
      )}
    </div>
  )
}
