'use client'

import { useState, useEffect, useRef, useCallback, type PointerEvent } from 'react'
import { audioManager } from '@/lib/audio-manager'
import { buildYouTubeEmbedUrl } from '@/lib/parseEmbed'
import { applyNextThumbnailFallback, applyThumbnailLoadGuard, getThumbnailCandidates, isBadOrMissingThumbnail } from '@/lib/media/thumbnails'
import { tryNativeFullscreen } from '@/lib/fullscreen'
import {
  consumePendingYouTubeActivation,
  isYouTubePlayingMessage,
  nudgeYouTubeQuality,
  pauseYouTubePlayback,
  primeYouTubePlayer,
  requestYouTubeActivation,
  shouldMountYouTubePlayer,
  shouldRevealYouTubePlayer,
  shouldShowYouTubePosterVeil,
  startYouTubePlayback,
  YOUTUBE_MOBILE_REVEAL_SETTLE_MS,
  YOUTUBE_READY_SETTLE_MS,
  youtubePrewarmOptions,
} from '@/lib/youtube-player'
import { beginInvocation, isIntentionalInvocation, type InvocationPoint } from '@/lib/media-invocation'
import TheaterOverlay from '@/components/TheaterOverlay'
import MusicEmbedTile from '@/components/MusicEmbedTile'

// ════════════════════════════════════════
// GHOST TILE — de-branded media renderer
//
// Strips platform chrome. Renders under Footprint's aesthetic.
// Two archetypes:
//   Audio pipe  — Spotify, SoundCloud: hidden iframe, custom UI
//   Visual pipe — YouTube, Vimeo: blurred bg + iframe reveal on play
// ════════════════════════════════════════

const GHOST_PAUSE_EVENT = 'ghost-tile-pause'

type Archetype = 'audio' | 'visual'

function getArchetype(platform: string, _url: string): Archetype {
  if (platform === 'spotify') return 'audio'
  if (platform === 'apple_music') return 'audio'
  if (platform === 'soundcloud') return 'audio'
  return 'visual'
}

function isAppleMusicUrl(url: string): boolean {
  return /music\.apple\.com\//i.test(url)
}

interface GhostTileProps {
  url: string
  platform: string
  media_id: string
  title?: string
  artist?: string
  thumbnail_url?: string
  /** YouTube clip start time (ms) — if set, iframe autoplays from this point */
  clip_start_ms?: number
  /** YouTube clip end time (ms) — if set, iframe stops here */
  clip_end_ms?: number
  displayMode?: 'cover' | 'player'

  onPlay?: () => void
}

export default function GhostTile({
  url,
  platform,
  media_id,
  title,
  artist,
  thumbnail_url,
  clip_start_ms,
  clip_end_ms,
  displayMode = 'player',
  onPlay,
}: GhostTileProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [youtubeHasStarted, setYoutubeHasStarted] = useState(false)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const [isNearViewport, setIsNearViewport] = useState(false)
  const [iframeFailed, setIframeFailed] = useState(false)
  const [thumbnailExhausted, setThumbnailExhausted] = useState(false)
  const [theaterOpen, setTheaterOpen] = useState(false)
  const iframeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tileRef = useRef<HTMLDivElement | null>(null)
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null)
  const youtubePlayerReadyRef = useRef(false)
  const youtubePendingActivationRef = useRef(false)
  const youtubeRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const invocationPointRef = useRef<InvocationPoint | null>(null)
  const [youtubeRevealSettled, setYoutubeRevealSettled] = useState(false)

  // Pause the underlying tile YouTube player while the theater overlay is
  // open so audio doesn't double-up.
  useEffect(() => {
    if (!theaterOpen) return
    const tileIframe = tileRef.current?.querySelector('iframe') as HTMLIFrameElement | null
    try {
      tileIframe?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }),
        '*'
      )
    } catch {}
  }, [theaterOpen])
  const tileId = useRef(`ghost-${media_id}-${Math.random().toString(36).slice(2, 6)}`)

  useEffect(() => {
    setIsCoarsePointer(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  useEffect(() => {
    return () => {
      if (youtubeRevealTimerRef.current) clearTimeout(youtubeRevealTimerRef.current)
    }
  }, [])

  const veilYouTubeSurface = useCallback(() => {
    pauseYouTubePlayback(youtubeIframeRef.current)
    setIsPlaying(false)
    setYoutubeHasStarted(false)
    setYoutubeRevealSettled(false)
    youtubePendingActivationRef.current = false
    if (youtubeRevealTimerRef.current) {
      clearTimeout(youtubeRevealTimerRef.current)
      youtubeRevealTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    const el = tileRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsNearViewport(entry.isIntersecting),
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])


  const archetype = getArchetype(platform, url)

  // Register with global AudioManager so ContentCard tiles also pause
  useEffect(() => {
    const id = tileId.current
    audioManager.register(id, () => {
      veilYouTubeSurface()
    })
    return () => audioManager.unregister(id)
  }, [veilYouTubeSurface])

  // Listen for pause events from other ghost tiles
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.except !== tileId.current) {
        veilYouTubeSurface()
      }
    }
    window.addEventListener(GHOST_PAUSE_EVENT, handler)
    return () => window.removeEventListener(GHOST_PAUSE_EVENT, handler)
  }, [veilYouTubeSurface])

  useEffect(() => {
    if (platform !== 'youtube') return
    const onCollectionScroll = () => veilYouTubeSurface()
    window.addEventListener('fp:collection-scroll-start', onCollectionScroll)
    return () => window.removeEventListener('fp:collection-scroll-start', onCollectionScroll)
  }, [platform, veilYouTubeSurface])

  // Auto-revert to thumbnail when video ends.
  // YouTube (via enablejsapi=1): { event: 'onStateChange' | 'infoDelivery', info: 0 } — 0 = ended.
  // TikTok (player/v1): { type: 'onStateChange', value: 0, 'x-tiktok-player': true }.
  // Vimeo: { event: 'ended' }.
  useEffect(() => {
    if (!isPlaying) return
    const ALLOWED_ORIGINS = new Set([
      'https://www.youtube-nocookie.com',
      'https://www.youtube.com',
      'https://www.tiktok.com',
      'https://player.vimeo.com',
    ])
    const onMessage = (e: MessageEvent) => {
      if (!ALLOWED_ORIGINS.has(e.origin)) return
      let data: any = e.data
      if (typeof data === 'string') {
        try { data = JSON.parse(data) } catch { return }
      }
      if (!data || typeof data !== 'object') return

      const youtubeEnded =
        (data.event === 'onStateChange' && data.info === 0) ||
        (data.event === 'infoDelivery' && data.info?.playerState === 0)
      const tiktokEnded =
        data['x-tiktok-player'] && data.type === 'onStateChange' && data.value === 0
      const vimeoEnded = data.event === 'ended'

      if (youtubeEnded || tiktokEnded || vimeoEnded) {
        setIsPlaying(false)
        setIframeLoaded(false)
        setYoutubeHasStarted(false)
        setYoutubeRevealSettled(false)
        youtubePendingActivationRef.current = false
        if (youtubeRevealTimerRef.current) {
          clearTimeout(youtubeRevealTimerRef.current)
          youtubeRevealTimerRef.current = null
        }
      }
      if (platform === 'youtube' && isYouTubePlayingMessage(data)) {
        setYoutubeHasStarted(true)
        if (youtubeRevealTimerRef.current) clearTimeout(youtubeRevealTimerRef.current)
        youtubeRevealTimerRef.current = setTimeout(() => {
          setYoutubeRevealSettled(true)
        }, isCoarsePointer ? YOUTUBE_MOBILE_REVEAL_SETTLE_MS : 0)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [isCoarsePointer, isPlaying, platform])

  const handlePlay = useCallback(() => {
    // Pause other ghost tiles
    window.dispatchEvent(new CustomEvent(GHOST_PAUSE_EVENT, { detail: { except: tileId.current } }))
    // Pause ContentCard tiles via AudioManager
    audioManager.play(tileId.current)
    setIsPlaying(true)
    setIframeFailed(false)
    if (platform === 'youtube') {
      setYoutubeHasStarted(false)
      setYoutubeRevealSettled(false)
      if (youtubeRevealTimerRef.current) {
        clearTimeout(youtubeRevealTimerRef.current)
        youtubeRevealTimerRef.current = null
      }
      const activation = requestYouTubeActivation(youtubePlayerReadyRef.current)
      youtubePendingActivationRef.current = activation.pendingActivation
      if (activation.shouldPlayNow) startYouTubePlayback(youtubeIframeRef.current)
    }
    // Timeout: if the iframe doesn't fire onLoad within 8s, show fallback.
    // Cleared in the onLoad handler if load succeeds.
    iframeTimerRef.current = setTimeout(() => { setIframeFailed(true) }, 8000)
    onPlay?.()
  }, [onPlay, platform])

  const handleToggle = useCallback(() => {
    if (isPlaying) {
      if (platform === 'youtube') veilYouTubeSurface()
      else setIsPlaying(false)
    } else {
      handlePlay()
    }
  }, [isPlaying, handlePlay, platform, veilYouTubeSurface])

  const handleInvocationPointerDown = useCallback((e: PointerEvent<HTMLElement>, invoke: () => void) => {
    e.stopPropagation()
    if (e.pointerType === 'mouse') {
      invoke()
      return
    }
    invocationPointRef.current = beginInvocation(e.pointerId, e.clientX, e.clientY)
  }, [])

  const handleInvocationPointerUp = useCallback((e: PointerEvent<HTMLElement>, invoke: () => void) => {
    e.stopPropagation()
    if (e.pointerType === 'mouse') return
    const shouldInvoke = isIntentionalInvocation(invocationPointRef.current, e.pointerId, e.clientX, e.clientY)
    invocationPointRef.current = null
    if (shouldInvoke) invoke()
  }, [])

  // Thumbnail URL
  const thumbCandidates = getThumbnailCandidates({
    type: platform,
    url,
    media_id,
    thumbnail_url,
  })
  const thumbUrl = thumbCandidates[0] || null

  // ════════════════════════════════════════
  // MUSIC — use the same cover/player renderer as newly-added tiles.
  // ════════════════════════════════════════
  if (platform === 'spotify') {
    return (
      <MusicEmbedTile
        url={url}
        provider="spotify"
        title={title || 'Spotify'}
        artist={artist}
        image={thumbUrl}
        displayMode={displayMode}
      />
    )
  }

  // ════════════════════════════════════════
  // APPLE MUSIC
  // ════════════════════════════════════════
  if (platform === 'apple_music' || isAppleMusicUrl(url)) {
    return (
      <MusicEmbedTile
        url={url}
        provider="apple_music"
        title={title || 'Apple Music'}
        artist={artist}
        image={thumbUrl}
        displayMode={displayMode}
      />
    )
  }

  // ════════════════════════════════════════
  // OTHER AUDIO — SoundCloud etc: hidden iframe approach
  // ════════════════════════════════════════
  if (archetype === 'audio') {
    return (
      <div className="w-full h-full relative overflow-hidden fp-tile" style={{ borderRadius: 'inherit' }}>
        <ThumbnailBg src={thumbUrl} candidates={thumbCandidates} />
        <div
          className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer"
          style={{ zIndex: 2 }}
          onPointerDown={(e) => handleInvocationPointerDown(e, handleToggle)}
          onPointerUp={(e) => handleInvocationPointerUp(e, handleToggle)}
          onPointerCancel={() => { invocationPointRef.current = null }}
        >
          {isPlaying ? <WaveformBars /> : null}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════
  // TWITTER / X — blockquote + widgets.js approach
  // Platform/X has no public iframe embed API. Twitter's own widgets.js
  // script transforms a `<blockquote class="twitter-tweet">` pointing at
  // the tweet URL into a full inline-rendered tweet (author, media, etc.).
  // Click-to-reveal same as youtube — text card facade → real tweet on tap.
  // ════════════════════════════════════════
  if (platform === 'twitter') {
    return (
      <div
        className="w-full h-full relative fp-tile group overflow-hidden"
        style={{ borderRadius: 'inherit', clipPath: 'inset(0 round var(--fp-tile-radius, 0px))' }}
      >
        {/* Facade — tweet text preview + play affordance */}
        <div
          className="absolute inset-0 flex flex-col items-stretch justify-center p-5 cursor-pointer"
          style={{
            opacity: isPlaying ? 0 : 1,
            pointerEvents: isPlaying ? 'none' : 'auto',
            transition: 'opacity 0.4s ease',
            zIndex: 2,
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(22px) saturate(140%)',
            WebkitBackdropFilter: 'blur(22px) saturate(140%)',
          }}
          onPointerDown={(e) => handleInvocationPointerDown(e, handlePlay)}
          onPointerUp={(e) => handleInvocationPointerUp(e, handlePlay)}
          onPointerCancel={() => { invocationPointRef.current = null }}
        >
          {title ? (
            <p className="text-white/85 text-[15px] leading-snug line-clamp-6 whitespace-pre-wrap">{title}</p>
          ) : (
            <p className="text-white/40 text-sm">tweet</p>
          )}
          {artist ? <p className="text-white/50 text-xs mt-3">{artist}</p> : null}
        </div>

        {/* Inline tweet — Twitter widgets.js transforms the blockquote into the real embed */}
        {isPlaying ? (
          <div className="absolute inset-0 overflow-auto" style={{ background: 'transparent', zIndex: 1 }}>
            <TwitterEmbed url={url} />
          </div>
        ) : null}
      </div>
    )
  }

  // ════════════════════════════════════════
  // VISUAL PIPE — YouTube, Vimeo, TikTok, Instagram
  // Blurred thumbnail bg + iframe reveal on play
  // ════════════════════════════════════════
  // Instagram URL shape determines embed path (post vs reel).
  const isInstagramReel = platform === 'instagram' && /\/reel\//.test(url)
  // YouTube clip support: convert ms → integer seconds for start/end params.
  const ytClipStart = clip_start_ms ? Math.floor(clip_start_ms / 1000) : 0
  const ytClipEnd = clip_end_ms ? Math.ceil(clip_end_ms / 1000) : 0
  // When the thumbnail facade can't render (empty url / chain lands on
  // ytimg `default.jpg`), skip the dormant grey state and mount the
  // YouTube embed directly so the tile shows YouTube's own player UI.
  const shouldAutoActivateEmbed =
    platform === 'youtube' && (isBadOrMissingThumbnail(thumbUrl) || thumbnailExhausted)
  const effectiveActivated = isPlaying || shouldAutoActivateEmbed
  const shouldMountPlayer =
    platform !== 'youtube' ||
    shouldMountYouTubePlayer(platform, effectiveActivated, isCoarsePointer, isNearViewport)
  const shouldRevealFromReadyState =
    !isCoarsePointer && youtubePlayerReadyRef.current && !youtubePendingActivationRef.current
  const shouldRevealPlayer = platform === 'youtube'
    ? iframeLoaded && shouldRevealYouTubePlayer(
        effectiveActivated,
        youtubeHasStarted,
        false,
        shouldRevealFromReadyState,
        youtubeRevealSettled,
      )
    : effectiveActivated && iframeLoaded
  const shouldShowPosterVeil = platform === 'youtube'
    ? shouldShowYouTubePosterVeil(effectiveActivated, shouldRevealPlayer)
    : !effectiveActivated
  const iframeSrc = platform === 'youtube'
    // Keep the URL stable while active so play/pause commands do not remount
    // the iframe mid-session.
    ? buildYouTubeEmbedUrl(media_id, youtubePrewarmOptions(ytClipStart, ytClipEnd))
    : platform === 'vimeo'
    // Vimeo respects `quality` param: "1080p" | "720p" | ... | "auto"
    ? `https://player.vimeo.com/video/${media_id}?title=0&byline=0&portrait=0&badge=0&dnt=1&autoplay=1&quality=1080p`
    : platform === 'tiktok'
    ? `https://www.tiktok.com/player/v1/${media_id}?autoplay=1&music_info=1&description=0&rel=0&closed_caption=0&loop=0&native_context_menu=0&progress_bar=1`
    : platform === 'instagram' && media_id
    ? `https://www.instagram.com/${isInstagramReel ? 'reel' : 'p'}/${media_id}/embed/captioned/`
    : undefined

  // postMessage unmute for mobile Safari + subscribe to player state events +
  // force highest available playback quality (hd1080+, fallback chain).
  const handleYTLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    if (platform !== 'youtube') return
    const iframe = e.currentTarget
    setTimeout(() => {
      primeYouTubePlayer(iframe, media_id)
      youtubePlayerReadyRef.current = true
      const activation = consumePendingYouTubeActivation(youtubePendingActivationRef.current)
      youtubePendingActivationRef.current = activation.pendingActivation
      if (activation.shouldPlayNow) startYouTubePlayback(iframe)
    }, YOUTUBE_READY_SETTLE_MS)
    // Quality nudges — YouTube auto-selects based on viewport + bandwidth, but
    // setPlaybackQuality is still honored as a soft preference. Send descending
    // so the player lands on the highest it can actually serve for the video.
    // Fired several times because the YT player sometimes ignores early calls
    // before the first video frame is ready.
    const nudgeQuality = () => nudgeYouTubeQuality(iframe)
    nudgeQuality()
    setTimeout(nudgeQuality, 300)
    setTimeout(nudgeQuality, 1000)
    setTimeout(nudgeQuality, 2500)
    setTimeout(nudgeQuality, 5000)
  }, [isPlaying, platform, media_id])

  return (
    <div
      ref={tileRef}
      className="w-full h-full relative fp-tile group"
      style={{
        borderRadius: 'inherit',
        overflow: 'hidden',
        // clip-path clips cross-origin iframes (overflow:hidden alone doesn't)
        clipPath: 'inset(0 round var(--fp-tile-radius, 0px))',
      }}
    >
      <ThumbnailBg
        src={thumbnailExhausted ? null : thumbUrl}
        candidates={thumbCandidates}
        cropBars
        onExhausted={() => setThumbnailExhausted(true)}
      />

      {/* Whole-tile play affordance — invisible click target. */}
      <div
        className="absolute inset-0 cursor-pointer"
        style={{
          opacity: shouldShowPosterVeil ? 1 : 0,
          pointerEvents: shouldShowPosterVeil ? 'auto' : 'none',
          transition: 'opacity 0.4s ease',
          zIndex: 2,
        }}
        onPointerDown={(e) => handleInvocationPointerDown(e, platform === 'youtube' ? handlePlay : handlePlay)}
        onPointerUp={(e) => handleInvocationPointerUp(e, platform === 'youtube' ? handlePlay : handlePlay)}
        onPointerCancel={() => { invocationPointRef.current = null }}
      />

      {/* Fallback: if iframe fails or times out, show a graceful link-out */}
      {isPlaying && iframeFailed && (
        <div className="fp-open-source-fallback absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ zIndex: 3 }}>
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="fp-open-source-link transition-colors">
            open source ↗
          </a>
        </div>
      )}

      {shouldMountPlayer && iframeSrc && !iframeFailed && (
        <div
          className="absolute inset-0 w-full h-full [&_iframe]:!absolute [&_iframe]:!inset-0 [&_iframe]:!w-full [&_iframe]:!max-w-none [&_iframe]:!h-full"
          style={{
            opacity: Number(shouldRevealPlayer),
            transition: 'opacity 0.25s ease',
            zIndex: 1,
            pointerEvents: effectiveActivated ? 'auto' : 'none',
          }}
        >
          {/* Iframe sized to its platform's native aspect, centered in the
              cell. The blurred ThumbnailBg behind fills any mismatch so a
              vertical TikTok in a wide cell reads as sharp-center +
              blurred poster aura, not raw black side bars. */}
          <iframe
            ref={platform === 'youtube' ? youtubeIframeRef : undefined}
            src={iframeSrc}
            className="block"
            width={platform === 'youtube' ? 1920 : undefined}
            height={platform === 'youtube' ? 1080 : undefined}
            style={{
              border: 'none',
              aspectRatio: platform === 'tiktok' || isInstagramReel ? '9 / 16' : '16 / 9',
              maxWidth: '100%',
              maxHeight: '100%',
            }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading={platform === 'youtube' ? 'eager' : 'lazy'}
            onLoad={(e) => {
              if (iframeTimerRef.current) clearTimeout(iframeTimerRef.current)
              setIframeLoaded(true)
              handleYTLoad(e)
            }}
            onError={() => { setIframeFailed(true) }}
          />
          {/* Mobile (coarse pointer): tap anywhere → focus mode. Provider
              iframes can't be trusted to native-fullscreen on iOS, so we
              don't try. Desktop (fine pointer): hover chip → native
              fullscreen with theater as final fallback. */}
          {platform === 'youtube' && (
            <>
              <button
                type="button"
                aria-label="Open focus mode"
                onClick={(e) => { e.stopPropagation(); setTheaterOpen(true) }}
                className="absolute inset-0 hidden [@media(pointer:coarse)]:block"
                style={{
                  zIndex: 3,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
              />
              <button
                type="button"
                aria-label="Fullscreen"
                onClick={(e) => {
                  e.stopPropagation()
                  const btn = e.currentTarget as HTMLElement
                  const container = (btn.closest('[data-tile]') as HTMLElement) || tileRef.current
                  const iframe = container?.querySelector('iframe') as HTMLIFrameElement | null
                  nudgeYouTubeQuality(iframe)
                  tryNativeFullscreen(iframe).then((ok) => {
                    if (ok) return
                    tryNativeFullscreen(container).then((ok2) => {
                      if (!ok2) setTheaterOpen(true)
                    })
                  })
                }}
                className="absolute items-center justify-center text-white/85 hover:text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-300 hidden [@media(pointer:fine)]:flex"
                style={{
                  bottom: 12,
                  right: 12,
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  zIndex: 4,
                  background: 'rgba(0,0,0,0.45)',
                  backdropFilter: 'blur(10px) saturate(140%)',
                  WebkitBackdropFilter: 'blur(10px) saturate(140%)',
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
                  pointerEvents: 'auto',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>
                </svg>
              </button>
            </>
          )}
        </div>
      )}
      {platform === 'youtube' && theaterOpen && iframeSrc && (
        <TheaterOverlay src={iframeSrc} onClose={() => setTheaterOpen(false)} />
      )}
    </div>
  )
}

// ════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════

/**
 * Twitter/X inline embed via widgets.js (createTweet API).
 * Extract the tweet ID from the URL, then call twttr.widgets.createTweet
 * which directly fetches + renders the tweet inside our container element.
 * More reliable than blockquote auto-transform — no race condition with
 * widgets.load(), and we get a Promise we can hook into for failure UI.
 */
function TwitterEmbed({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const tweetId = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status(?:es)?\/(\d+)/)?.[1]
    if (!tweetId) { setFailed(true); return }
    const w = window as any
    const render = () => {
      if (!ref.current) return
      ref.current.innerHTML = ''
      try {
        w.twttr.widgets.createTweet(tweetId, ref.current, {
          theme: 'dark',
          dnt: true,
          align: 'center',
          conversation: 'none',
        }).then((el: any) => { if (!el) setFailed(true) })
          .catch(() => setFailed(true))
      } catch { setFailed(true) }
    }
    const ensureScript = () => {
      if (w.twttr?.widgets) { render(); return }
      const existing = document.querySelector('script[data-twttr]') as HTMLScriptElement | null
      if (existing) {
        if (w.twttr?.widgets) render()
        else existing.addEventListener('load', render, { once: true })
        return
      }
      const s = document.createElement('script')
      s.src = 'https://platform.twitter.com/widgets.js'
      s.async = true
      s.setAttribute('data-twttr', '1')
      s.addEventListener('load', render, { once: true })
      document.body.appendChild(s)
    }
    ensureScript()
  }, [url])
  return (
    <div className="w-full h-full overflow-auto bg-black flex items-start justify-center p-2">
      <div ref={ref} className="w-full" />
      {failed ? (
        <div className="text-white/40 text-sm p-4 text-center">
          tweet unavailable —{' '}
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline">open on x</a>
        </div>
      ) : null}
    </div>
  )
}

function ThumbnailBg({
  src,
  candidates,
  cropBars = false,
  onExhausted,
}: {
  src: string | null
  candidates: string[]
  cropBars?: boolean
  onExhausted?: () => void
}) {
  if (!src) return (
    <div className="absolute inset-0" style={{ background: 'rgba(0, 0, 0, 0.6)' }} />
  )
  return (
    <div className={cropBars ? 'fp-resting-video-frame' : 'absolute inset-0'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={cropBars ? 'fp-resting-video-media' : 'absolute inset-0 w-full h-full object-cover'}
        style={{}}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={(e) => {
          applyThumbnailLoadGuard(e.currentTarget, candidates)
          // Chain landed on the lowest-res `/default.jpg` — every higher-res
          // ytimg variant returned the grey unavailable placeholder.
          const finalSrc = e.currentTarget.currentSrc || e.currentTarget.src
          if (onExhausted && /\/vi\/[^/]+\/default\.jpg/.test(finalSrc)) {
            onExhausted()
          }
        }}
        onError={(e) => {
          const advanced = applyNextThumbnailFallback(e.currentTarget, candidates)
          if (!advanced) onExhausted?.()
        }}
      />
    </div>
  )
}

function PlayIcon() {
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        transition: 'all 0.25s ease',
      }}
    >
      <svg className="w-5 h-5 ml-0.5" fill="rgba(255, 255, 255, 0.9)" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  )
}

function TitleBlock({ title, artist }: { title?: string; artist?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 max-w-full">
      {title && (
        <p
          className="line-clamp-2 text-center fp-text-shadow"
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.8)',
            lineHeight: 1.35,
          }}
        >
          {title}
        </p>
      )}
      {artist && (
        <p
          className="truncate max-w-full text-center"
          style={{
            fontSize: '9px',
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.4)',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            lineHeight: 1.2,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {artist}
        </p>
      )}
    </div>
  )
}

// ── Waveform animation bars ──

const barKeyframes = `
@keyframes ghost-wave-1 { 0%, 100% { height: 20%; } 50% { height: 80%; } }
@keyframes ghost-wave-2 { 0%, 100% { height: 40%; } 50% { height: 60%; } }
@keyframes ghost-wave-3 { 0%, 100% { height: 60%; } 50% { height: 30%; } }
@keyframes ghost-wave-4 { 0%, 100% { height: 30%; } 50% { height: 90%; } }
@keyframes ghost-wave-5 { 0%, 100% { height: 50%; } 50% { height: 40%; } }
@keyframes ghost-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.015); } }
`

function WaveformBars() {
  const bars = [
    { animation: 'ghost-wave-1 1.2s ease-in-out infinite', delay: '0s' },
    { animation: 'ghost-wave-2 1.0s ease-in-out infinite', delay: '0.1s' },
    { animation: 'ghost-wave-3 0.8s ease-in-out infinite', delay: '0.2s' },
    { animation: 'ghost-wave-4 1.1s ease-in-out infinite', delay: '0.15s' },
    { animation: 'ghost-wave-5 0.9s ease-in-out infinite', delay: '0.05s' },
  ]

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: barKeyframes }} />
      <div className="flex items-end gap-[3px]" style={{ height: 24 }}>
        {bars.map((bar, i) => (
          <div
            key={i}
            style={{
              width: 3,
              borderRadius: 1,
              background: 'rgba(255, 255, 255, 0.3)',
              animation: bar.animation,
              animationDelay: bar.delay,
            }}
          />
        ))}
      </div>
    </>
  )
}

function WaveformBarsIdle() {
  const heights = [4, 7, 10, 6, 8]
  return (
    <div className="flex items-end gap-[2px]" style={{ height: 12 }}>
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 2,
            height: h,
            borderRadius: 1,
            background: 'rgba(255, 255, 255, 0.5)',
          }}
        />
      ))}
    </div>
  )
}
