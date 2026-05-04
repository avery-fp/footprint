/**
 * Per-room dual-color sampling.
 *
 * Each room's wallpaper used to read as a single hue-rotated tint of the
 * footprint background, which made world / archive / sound feel like
 * variations of the same mauve-olive gradient. This samples the visible
 * tile media area-weighted, picks a dominant hue and a chromatically
 * distant accent, and exposes both as CSS rgb() strings the wallpaper
 * layer composites as a gradient.
 *
 * Single-color rooms (e.g. sound, mostly dark) collapse to dominant +
 * a luminance-shifted variant so they still read as their own atmosphere.
 */

export interface RoomPalette {
  dominant: string
  accent: string
}

interface RGB {
  r: number
  g: number
  b: number
}

interface TileSample {
  url: string
  weight: number
}

const SAMPLE_SIZE = 32
const QUANT_LEVELS = 5
const MIN_HUE_DISTANCE = 35
const MIN_ACCENT_SATURATION = 0.18
const MAX_TILES_PER_ROOM = 12

const pixelCache = new Map<string, RGB[]>()

function loadAndSample(url: string): Promise<RGB[]> {
  if (pixelCache.has(url)) return Promise.resolve(pixelCache.get(url)!)
  return new Promise(resolve => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve([])
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    let settled = false
    const finish = (pixels: RGB[]) => {
      if (settled) return
      settled = true
      pixelCache.set(url, pixels)
      resolve(pixels)
    }
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = SAMPLE_SIZE
        canvas.height = SAMPLE_SIZE
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return finish([])
        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
        const pixels: RGB[] = []
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue
          pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
        }
        finish(pixels)
      } catch {
        // Tainted canvas (CORS) or any decode failure — drop this image.
        finish([])
      }
    }
    img.onerror = () => finish([])
    img.src = url
  })
}

function quantizeKey(rgb: RGB): string {
  const step = 256 / QUANT_LEVELS
  const r = Math.min(QUANT_LEVELS - 1, Math.floor(rgb.r / step))
  const g = Math.min(QUANT_LEVELS - 1, Math.floor(rgb.g / step))
  const b = Math.min(QUANT_LEVELS - 1, Math.floor(rgb.b / step))
  return `${r},${g},${b}`
}

function bucketCenter(key: string): RGB {
  const [r, g, b] = key.split(',').map(Number)
  const step = 256 / QUANT_LEVELS
  return {
    r: Math.round(r * step + step / 2),
    g: Math.round(g * step + step / 2),
    b: Math.round(b * step + step / 2),
  }
}

function rgbToHsl(rgb: RGB): { h: number; s: number; l: number } {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h, s, l }
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function rgbToCss(rgb: RGB): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
}

function shiftLuminance(rgb: RGB, factor: number): RGB {
  return {
    r: Math.max(0, Math.min(255, Math.round(rgb.r * factor))),
    g: Math.max(0, Math.min(255, Math.round(rgb.g * factor))),
    b: Math.max(0, Math.min(255, Math.round(rgb.b * factor))),
  }
}

/**
 * Pure histogram → palette extraction. Exported for unit testing without DOM.
 *
 * @param samples One pixel array per tile.
 * @param weights Area weight per tile (parallel to `samples`).
 */
export function palettizeFromSamples(samples: RGB[][], weights: number[]): RoomPalette | null {
  // Area-weighted histogram: each tile's pixels are scaled by its size.
  // Strip near-black / near-white from the chromatic ranking so dark
  // matter and blown highlights don't dominate.
  const buckets = new Map<string, number>()
  let chromaticPixels = 0
  for (let i = 0; i < samples.length; i++) {
    const weight = Math.max(1, weights[i] ?? 1)
    for (const px of samples[i]) {
      const hsl = rgbToHsl(px)
      if (hsl.l < 0.06 || hsl.l > 0.94) continue
      chromaticPixels++
      const key = quantizeKey(px)
      buckets.set(key, (buckets.get(key) || 0) + weight)
    }
  }

  if (chromaticPixels === 0) return null

  const sorted = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1])
  const dominantRgb = bucketCenter(sorted[0][0])
  const dominantHsl = rgbToHsl(dominantRgb)

  let accentRgb: RGB | null = null
  for (let i = 1; i < sorted.length; i++) {
    const candidate = bucketCenter(sorted[i][0])
    const hsl = rgbToHsl(candidate)
    if (hsl.s < MIN_ACCENT_SATURATION) continue
    if (hueDistance(dominantHsl.h, hsl.h) < MIN_HUE_DISTANCE) continue
    accentRgb = candidate
    break
  }

  // Single-color fallback: shift luminance instead of returning the same color twice.
  if (!accentRgb) {
    accentRgb = shiftLuminance(dominantRgb, dominantHsl.l > 0.5 ? 0.55 : 1.6)
  }

  return {
    dominant: rgbToCss(dominantRgb),
    accent: rgbToCss(accentRgb),
  }
}

export async function sampleRoomColors(tiles: TileSample[]): Promise<RoomPalette | null> {
  const usable = tiles.filter(t => t.url).slice(0, MAX_TILES_PER_ROOM)
  if (usable.length === 0) return null
  const samples = await Promise.all(usable.map(t => loadAndSample(t.url)))
  return palettizeFromSamples(samples, usable.map(t => t.weight))
}

// Deterministic palette from a room name. Used as a fallback so every room
// paints chromatically even when canvas sampling returns nothing (CORS-tainted
// tiles, all-thought rooms, etc.). Tile-sampled palette overrides when it lands.
export function paletteFromName(name: string): RoomPalette {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  const base = hash % 360
  const accent = (base + 140) % 360
  return {
    dominant: `hsl(${base}, 55%, 46%)`,
    accent: `hsl(${accent}, 50%, 30%)`,
  }
}
