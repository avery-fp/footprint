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
        className="w-full aspect-video min-h-[300px] object-cover rounded-2xl cursor-pointer"
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
