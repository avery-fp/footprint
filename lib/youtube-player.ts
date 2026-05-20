const YOUTUBE_PLAY_RETRY_MS = [250, 700, 1200] as const
export const YOUTUBE_READY_SETTLE_MS = 800
export const YOUTUBE_MOBILE_REVEAL_SETTLE_MS = 6000

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
  return platform === 'youtube' && isCoarsePointer && isNearViewport
}

export function shouldMountYouTubePlayer(
  platform: string,
  isActivated: boolean,
  isCoarsePointer: boolean,
  isNearViewport: boolean,
) {
  return platform === 'youtube' && (isActivated || shouldPrewarmYouTubePlayer(platform, isCoarsePointer, isNearViewport))
}

export function shouldRevealYouTubePlayer(
  isActivated: boolean,
  _hasStarted: boolean,
  isPosterLocked = false,
  readyAfterActivation = false,
  hasSettled = false,
) {
  return !isPosterLocked && isActivated && (hasSettled || readyAfterActivation)
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

function getYouTubePlayerState(data: unknown) {
  if (!data || typeof data !== 'object') return null
  const payload = data as {
    event?: string
    info?: number | { playerState?: number }
  }
  if (payload.event === 'onStateChange' && typeof payload.info === 'number') {
    return payload.info
  }
  if (payload.event === 'infoDelivery' && typeof payload.info === 'object') {
    return payload.info?.playerState ?? null
  }
  return null
}

export function isYouTubePlayingMessage(data: unknown) {
  return getYouTubePlayerState(data) === 1
}

export function isYouTubeCoveredStateMessage(data: unknown) {
  const state = getYouTubePlayerState(data)
  return state === 0 || state === 2 || state === 3 || state === 5
}
