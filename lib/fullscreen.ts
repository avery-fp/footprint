/**
 * Native fullscreen helpers — single source of truth for the fullscreen
 * affordance. Different surfaces (uploaded video, GhostTile YouTube iframe,
 * ContentCard YouTube iframe) all need the same probe-and-fallback dance:
 *
 *   try native fullscreen on the target → if it rejects or isn't supported,
 *   the caller falls back to Footprint Theater (a fixed viewport overlay).
 *
 * iOS Safari rejects fullscreen on cross-origin iframes and on plain divs;
 * Chrome/Firefox honor it on iframe AND container. We try the iframe first
 * (cleanest player chrome), then the container.
 */

type AnyEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
  webkitEnterFullscreen?: () => void
}

/**
 * Returns true if the browser advertises fullscreen support at all.
 * Doesn't guarantee a specific element will succeed (cross-origin iframes
 * commonly fail at runtime even when the API is present) — pair this with
 * promise-rejection handling.
 */
export function hasFullscreenSupport(): boolean {
  if (typeof document === 'undefined') return false
  const d = document as Document & { webkitFullscreenEnabled?: boolean }
  if (d.fullscreenEnabled) return true
  if (d.webkitFullscreenEnabled) return true
  return false
}

/**
 * Coarse-pointer probe used to decide between native fullscreen and the
 * theater fallback for cross-origin iframes. iOS Safari is the dominant
 * device class that fails the native path; matchMedia('(pointer: coarse)')
 * is the cleanest available proxy.
 */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.matchMedia?.('(pointer: coarse)').matches)
}

/**
 * Attempts native fullscreen on `el`. Resolves true on success, false on
 * any rejection or missing API. Never throws.
 */
export function tryNativeFullscreen(el: HTMLElement | null): Promise<boolean> {
  if (!el) return Promise.resolve(false)
  const anyEl = el as AnyEl
  if (typeof el.requestFullscreen === 'function') {
    try {
      const p = el.requestFullscreen()
      if (p && typeof (p as Promise<unknown>).then === 'function') {
        return (p as Promise<void>).then(() => true).catch(() => false)
      }
      return Promise.resolve(true)
    } catch {
      return Promise.resolve(false)
    }
  }
  if (typeof anyEl.webkitRequestFullscreen === 'function') {
    try {
      const p = anyEl.webkitRequestFullscreen()
      if (p && typeof (p as Promise<unknown>).then === 'function') {
        return (p as Promise<void>).then(() => true).catch(() => false)
      }
      return Promise.resolve(true)
    } catch {
      return Promise.resolve(false)
    }
  }
  return Promise.resolve(false)
}

/**
 * iOS-Safari-specific native fullscreen for `<video>` elements. Resolves
 * true if invoked, false otherwise. Used by the uploaded-video tile —
 * regular requestFullscreen on <video> works on Android/desktop, but iOS
 * exposes only webkitEnterFullscreen for the native player chrome.
 */
export function tryVideoEnterFullscreen(video: HTMLVideoElement | null): boolean {
  if (!video) return false
  const v = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }
  if (typeof v.webkitEnterFullscreen === 'function') {
    try { v.webkitEnterFullscreen(); return true } catch { return false }
  }
  return false
}
