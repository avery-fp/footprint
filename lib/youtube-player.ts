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
