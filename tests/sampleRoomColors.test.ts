import { describe, it, expect } from 'vitest'
import { palettizeFromSamples } from '../lib/sampleRoomColors'

type RGB = { r: number; g: number; b: number }

const fill = (rgb: RGB, count: number): RGB[] => Array.from({ length: count }, () => rgb)

const parse = (css: string): RGB => {
  const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (!m) throw new Error(`bad rgb: ${css}`)
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
}

const rgbToHsl = ({ r, g, b }: RGB) => {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
  }
  return { h, s, l }
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

describe('palettizeFromSamples', () => {
  it('picks dominant from the most-frequent chromatic bucket', () => {
    // 100 px of orange, 30 px of teal — dominant must be orange-ish
    const orange: RGB = { r: 220, g: 120, b: 40 }
    const teal: RGB = { r: 30, g: 160, b: 160 }
    const palette = palettizeFromSamples(
      [[...fill(orange, 100), ...fill(teal, 30)]],
      [1]
    )
    expect(palette).not.toBeNull()
    const dom = parse(palette!.dominant)
    // Quantized bucket center should land in the orange octant: r dominant, b lowest
    expect(dom.r).toBeGreaterThan(dom.g)
    expect(dom.g).toBeGreaterThan(dom.b)
  })

  it('selects an accent that is chromatically distant from dominant', () => {
    // 60% mauve, 40% teal — two distinct hues, accent should be the other one
    const mauve: RGB = { r: 180, g: 110, b: 160 }
    const teal: RGB = { r: 30, g: 160, b: 160 }
    const palette = palettizeFromSamples(
      [[...fill(mauve, 60), ...fill(teal, 40)]],
      [1]
    )
    expect(palette).not.toBeNull()
    const dom = parse(palette!.dominant)
    const acc = parse(palette!.accent)
    const dh = rgbToHsl(dom).h
    const ah = rgbToHsl(acc).h
    // Spec floor: ≥35° hue separation
    expect(hueDistance(dh, ah)).toBeGreaterThanOrEqual(35)
    // Sanity: not the same color
    expect(palette!.dominant).not.toBe(palette!.accent)
  })

  it('falls back to luminance shift when room is single-color (no chromatic accent)', () => {
    // Only one chromatic bucket present
    const single: RGB = { r: 200, g: 90, b: 90 }
    const palette = palettizeFromSamples([fill(single, 200)], [1])
    expect(palette).not.toBeNull()
    const dom = parse(palette!.dominant)
    const acc = parse(palette!.accent)
    // Same hue family, different luminance
    const domHsl = rgbToHsl(dom)
    const accHsl = rgbToHsl(acc)
    expect(Math.abs(domHsl.l - accHsl.l)).toBeGreaterThan(0.1)
    expect(palette!.dominant).not.toBe(palette!.accent)
  })

  it('returns null when room is essentially all-black (sound-room edge case)', () => {
    const nearBlack: RGB = { r: 4, g: 3, b: 5 }
    const blownWhite: RGB = { r: 252, g: 253, b: 251 }
    const palette = palettizeFromSamples(
      [[...fill(nearBlack, 500), ...fill(blownWhite, 50)]],
      [1]
    )
    // Both stripped → no chromatic pixels → null (caller skips gradient layer)
    expect(palette).toBeNull()
  })

  it('respects area weighting — bigger tile dominates', () => {
    // Tile A (weight 1): orange. Tile B (weight 4): teal. Equal pixel counts.
    const orange: RGB = { r: 220, g: 120, b: 40 }
    const teal: RGB = { r: 30, g: 160, b: 160 }
    const palette = palettizeFromSamples(
      [fill(orange, 50), fill(teal, 50)],
      [1, 4]
    )
    expect(palette).not.toBeNull()
    const dom = parse(palette!.dominant)
    // Teal-leaning: blue dominant or near-equal-to green, both > red
    expect(dom.b).toBeGreaterThan(dom.r)
    expect(dom.g).toBeGreaterThan(dom.r)
  })

  it('returns null for empty input', () => {
    expect(palettizeFromSamples([], [])).toBeNull()
    expect(palettizeFromSamples([[]], [1])).toBeNull()
  })
})
