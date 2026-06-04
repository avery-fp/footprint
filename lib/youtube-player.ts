const YOUTUBE_PLAY_RETRY_MS = [250, 700, 1200] as const
export const YOUTUBE_READY_SETTLE_MS = 800
export const YOUTUBE_MOBILE_REVEAL_SETTLE_MS = 900
export const YOUTUBE_REVEAL_FALLBACK_MS = 1200

function postYouTubeMessage(
  iframe: HTMLIFrameElement | null,
  message: Record<string, unknown>,
) {
  if (!iframe) return
  try { iframe.contentWindow?.postMessage(JSON.stringify(message), '*') } catch {}
}

export function nudgeYouTubeQuality(iframe: HTMLIFrameElement | null) {
  if (!iframe) return
  for (const q of ['hd2160', 'hd1440', 'hd1080', 'highres']) {
    postYouTubeMessage(iframe, { event: 'command', func: 'setPlaybackQuality', args: [q] })
    postYouTubeMessage(iframe, { event: 'command', func: 'setPlaybackQualityRange', args: [q, q] })
  }
}

export function startYouTubePlayback(iframe: HTMLIFrameElement | null) {
  if (!iframe) return
  postYouTubeMessage(iframe, { event: 'command', func: 'playVideo', args: '' })
  postYouTubeMessage(iframe, { event: 'command', func: 'unMute', args: '' })
  postYouTubeMessage(iframe, { event: 'command', func: 'setVolume', args: [100] })
  for (const delay of YOUTUBE_PLAY_RETRY_MS) {
    setTimeout(() => {
      postYouTubeMessage(iframe, { event: 'command', func: 'playVideo', args: '' })
    }, delay)
  }
}

export function pauseYouTubePlayback(iframe: HTMLIFrameElement | null) {
  postYouTubeMessage(iframe, { event: 'command', func: 'pauseVideo', args: '' })
}

export function primeYouTubePlayer(iframe: HTMLIFrameElement | null, id: string) {
  postYouTubeMessage(iframe, { event: 'listening', id })
}

export function requestYouTubeActivation(isPlayerReady: boolean) {
  return {
    shouldPlayNow: isPlayerReady,
    pendingActivation: !isPlayerReady,
  } as const
}

export function consumePendingYouTubeActivation(pendingActivation: boolean) {
  return {
    shouldPlayNow: pendingActivation,
    pendingActivation: false,
  } as const
}

export function shouldPrewarmYouTubePlayer(
  platform: string,
  isCoarsePointer: boolean,
  isNearViewport: boolean,
) {
  void platform
  void isCoarsePointer
  void isNearViewport
  return false
}

export function shouldMountYouTubePlayer(
  platform: string,
  isActivated: boolean,
  isCoarsePointer: boolean,
  isNearViewport: boolean,
) {
  void isCoarsePointer
  void isNearViewport
  return platform === 'youtube' && isActivated
}

export function shouldRevealYouTubePlayer(
  isActivated: boolean,
  hasStarted: boolean,
  isPosterLocked = false,
  readyAfterActivation = false,
  hasSettled = false,
) {
  return !isPosterLocked && isActivated && readyAfterActivation && (hasStarted || hasSettled)
}

export function shouldShowYouTubePosterVeil(
  isActivated: boolean,
  isRevealed: boolean,
) {
  return !isActivated || !isRevealed
}

export function shouldUseYouTubePosterSurface(
  isSoundRoom: boolean,
  isYouTubeShort: boolean,
  aspect?: string | null,
) {
  const videoLikeAspect = aspect === 'wide' || aspect === 'landscape' || aspect === 'tall' || aspect === 'portrait'
  return isSoundRoom && !isYouTubeShort && !videoLikeAspect
}

export function youtubePrewarmOptions(start: number, end: number) {
  return {
    autoplay: false,
    mute: true,
    start,
    end,
    hd: true,
  } as const
}

export function isYouTubePlayingMessage(data: unknown) {
  if (!data || typeof data !== 'object') return false
  const payload = data as {
    event?: string
    info?: number | { playerState?: number }
  }
  return (
    (payload.event === 'onStateChange' && payload.info === 1) ||
    (payload.event === 'infoDelivery' &&
      typeof payload.info === 'object' &&
      payload.info?.playerState === 1)
  )
}
