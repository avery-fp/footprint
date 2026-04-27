'use client'

import { useRef } from 'react'

type EmptyHomeOriginProps = {
  serialNumber: number | null
  title: string
  goLiveLoading?: boolean
  onTitleChange: (nextTitle: string) => void
  onTitleBlur: (nextTitle: string) => void
  onChooseWallpaper: () => void
  onGoLive: () => void
}

export default function EmptyHomeOrigin({
  serialNumber,
  title,
  goLiveLoading = false,
  onTitleChange,
  onTitleBlur,
  onChooseWallpaper,
  onGoLive,
}: EmptyHomeOriginProps) {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const trimmedTitle = title.trim()

  return (
    <section
      className="absolute inset-0 z-20 min-h-[100dvh] overflow-hidden text-[#211a10]"
      style={{ background: '#f6f1e8' }}
      onClick={() => titleInputRef.current?.focus()}
    >
      <style>{`
        @keyframes empty-home-origin-caret {
          0%, 100% { opacity: 0.28; }
          50% { opacity: 0.46; }
        }
      `}</style>

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2764%27 height=%2764%27 viewBox=%270 0 64 64%27%3E%3Cpath fill=%27%23000000%27 fill-opacity=%270.22%27 d=%27M7 11h1v1H7zM23 5h1v1h-1zM41 17h1v1h-1zM59 9h1v1h-1zM12 37h1v1h-1zM31 29h1v1h-1zM53 41h1v1h-1zM5 57h1v1H5zM38 55h1v1h-1z%27/%3E%3C/svg%3E")',
        }}
      />

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onGoLive()
        }}
        disabled={goLiveLoading}
        className="absolute right-4 top-4 z-30 rounded-full bg-[#11100e] px-5 py-3 text-[12px] font-medium tracking-[0.01em] text-[#fbf8f1] transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-55 md:right-8 md:top-8"
        style={{ boxShadow: '0 8px 18px rgba(20,17,13,0.14)' }}
      >
        {goLiveLoading ? '...' : <>go live &rarr; $10</>}
      </button>

      <div className="absolute inset-x-0 top-[38%] z-10 flex -translate-y-1/2 flex-col items-center px-6">
        <label className="relative mb-10 flex h-12 w-full max-w-[min(34rem,calc(100vw-48px))] items-center justify-center">
          <span className="sr-only">Footprint title</span>
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            onBlur={(event) => onTitleBlur(event.target.value)}
            maxLength={120}
            className={[
              'h-full w-full bg-transparent px-2 text-center outline-none',
              'text-[clamp(28px,7vw,48px)] font-light leading-none text-[#211a10]/75',
              trimmedTitle ? 'caret-[#211a10]' : 'caret-transparent',
            ].join(' ')}
            style={{ letterSpacing: 0 }}
          />
          {!trimmedTitle && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-px -translate-x-1/2 -translate-y-1/2 bg-[#211a10]"
              style={{ animation: 'empty-home-origin-caret 2.8s ease-in-out infinite' }}
            />
          )}
        </label>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onChooseWallpaper()
          }}
          className="group flex aspect-square w-[min(34vw,178px)] min-w-[132px] items-center justify-center rounded-[22px] border border-[rgba(20,17,13,0.08)] bg-[#fbf8f1] text-[#241d12]/55 transition-[border-color,transform,color] duration-200 hover:border-[rgba(20,17,13,0.13)] hover:text-[#241d12]/75 active:scale-[0.985]"
          style={{
            boxShadow:
              '0 1px 0 rgba(255,255,255,0.82) inset, 0 10px 18px rgba(39,32,20,0.08), 0 2px 5px rgba(39,32,20,0.08)',
          }}
          aria-label="Choose wallpaper"
        >
          <span className="text-[44px] font-extralight leading-none md:text-[52px]">+</span>
        </button>
      </div>

      {serialNumber && (
        <p className="absolute bottom-5 left-5 z-10 font-mono text-[10px] tracking-[0.14em] text-[#211a10]/30 md:bottom-8 md:left-8">
          #{serialNumber}
        </p>
      )}
    </section>
  )
}
