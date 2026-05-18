export function nudgeYouTubeQuality(iframe: HTMLIFrameElement | null) {
  if (!iframe) return
  const post = (msg: Record<string, unknown>) => {
    try { iframe.contentWindow?.postMessage(JSON.stringify(msg), '*') } catch {}
  }
  for (const q of ['hd2160', 'hd1440', 'hd1080', 'highres']) {
    post({ event: 'command', func: 'setPlaybackQuality', args: [q] })
    post({ event: 'command', func: 'setPlaybackQualityRange', args: [q, q] })
  }
}

export function startYouTubePlayback(iframe: HTMLIFrameElement | null) {
  if (!iframe) return
  const post = (msg: Record<string, unknown>) => {
    try { iframe.contentWindow?.postMessage(JSON.stringify(msg), '*') } catch {}
  }
  post({ event: 'command', func: 'playVideo', args: '' })
  post({ event: 'command', func: 'unMute', args: '' })
  post({ event: 'command', func: 'setVolume', args: [100] })
}

export function shouldPrewarmYouTubePlayer(
  platform: string,
  isCoarsePointer: boolean,
) {
  return platform === 'youtube' && isCoarsePointer
}

export function shouldMountYouTubePlayer(
  platform: string,
  isActivated: boolean,
  isCoarsePointer: boolean,
) {
  return platform === 'youtube' && (isActivated || shouldPrewarmYouTubePlayer(platform, isCoarsePointer))
}

export function shouldRevealYouTubePlayer(isActivated: boolean, hasStarted: boolean) {
  return isActivated && hasStarted
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
