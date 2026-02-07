'use client'

import { useEffect, useRef } from 'react'

export default function WeatherEffect({ type }: { type: 'rain' | 'snow' | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!type || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: { x: number; y: number; speed: number; size: number; opacity: number }[] = []
    const count = type === 'rain' ? 200 : 80

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: type === 'rain' ? 8 + Math.random() * 12 : 0.5 + Math.random() * 1.5,
        size: type === 'rain' ? 1 : 2 + Math.random() * 3,
        opacity: 0.3 + Math.random() * 0.5,
      })
    }

    let animId: number
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach((p) => {
        if (type === 'rain') {
          ctx.strokeStyle = `rgba(174, 194, 224, ${p.opacity})`
          ctx.lineWidth = p.size
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x + 1, p.y + 15)
          ctx.stroke()
          p.y += p.speed
          p.x += 0.5
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          p.y += p.speed
          p.x += Math.sin(p.y * 0.01) * 0.5
        }
        if (p.y > canvas.height) {
          p.y = -10
          p.x = Math.random() * canvas.width
        }
      })
      animId = requestAnimationFrame(animate)
    }
    animate()

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
    }
  }, [type])

  if (!type) return null
  return <canvas ref={canvasRef} className="fixed inset-0 z-[5] pointer-events-none" />
}
