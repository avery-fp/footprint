export interface CollectionRenderWindow {
  start: number
  end: number
}

export function getCollectionRenderRadius(isMobile: boolean): number {
  return isMobile ? 3 : 4
}

export function clampCollectionIndex(index: number, length: number): number {
  if (length <= 0) return 0
  if (!Number.isFinite(index)) return 0
  return Math.min(Math.max(Math.round(index), 0), length - 1)
}

export function getCollectionRenderWindow(
  length: number,
  activeIndex: number,
  radius: number,
): CollectionRenderWindow {
  if (length <= 0) return { start: 0, end: -1 }
  const safeRadius = Math.max(0, Math.floor(radius))
  const center = clampCollectionIndex(activeIndex, length)
  return {
    start: Math.max(0, center - safeRadius),
    end: Math.min(length - 1, center + safeRadius),
  }
}

export function shouldRenderCollectionTile(
  index: number,
  length: number,
  activeIndex: number,
  radius: number,
): boolean {
  const window = getCollectionRenderWindow(length, activeIndex, radius)
  return index >= window.start && index <= window.end
}
