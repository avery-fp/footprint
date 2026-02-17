/**
 * SCREENSHOT AGENT — captures rooms in 4 formats via Puppeteer.
 *
 * Formats:
 *   og.png    (1200x630)  — Twitter/X card
 *   square.png (1080x1080) — Instagram feed
 *   story.png  (1080x1920) — IG/TikTok stories
 *   thumb.png  (600x600)   — preview thumbnail
 *
 * Saves to ignition-output/{slug}/
 *
 * Fallback: if Puppeteer fails, attempts screenshotone.com API.
 * Without screenshots there are no posts. This must work.
 */

import { mkdirSync, existsSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// ─── Types ──────────────────────────────────────────────

export interface ScreenshotFormat {
  name: string
  width: number
  height: number
  filename: string
}

export interface ScreenshotResult {
  slug: string
  dir: string
  files: Record<string, string>  // format name → file path
  method: 'puppeteer' | 'api' | 'failed'
}

const FORMATS: ScreenshotFormat[] = [
  { name: 'og', width: 1200, height: 630, filename: 'og.png' },
  { name: 'square', width: 1080, height: 1080, filename: 'square.png' },
  { name: 'story', width: 1080, height: 1920, filename: 'story.png' },
  { name: 'thumb', width: 600, height: 600, filename: 'thumb.png' },
]

const OUTPUT_BASE = resolve(process.cwd(), 'ignition-output')

// ─── Puppeteer capture ──────────────────────────────────

async function captureWithPuppeteer(
  url: string,
  slug: string,
  outDir: string
): Promise<Record<string, string>> {
  // Dynamic import — puppeteer may not be installed
  const puppeteer = await import('puppeteer')

  const browser = await puppeteer.default.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  })

  const files: Record<string, string> = {}

  try {
    const page = await browser.newPage()

    for (const format of FORMATS) {
      await page.setViewport({
        width: format.width,
        height: format.height,
        deviceScaleFactor: 2,
      })

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      })

      // Wait for images to load and wallpaper blur to render
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          // Wait for all images
          const images = document.querySelectorAll('img')
          if (images.length === 0) {
            resolve()
            return
          }

          let loaded = 0
          const total = images.length
          const check = () => {
            loaded++
            if (loaded >= total) resolve()
          }

          images.forEach((img) => {
            if (img.complete) {
              check()
            } else {
              img.addEventListener('load', check)
              img.addEventListener('error', check)
            }
          })

          // Safety timeout — don't wait forever
          setTimeout(resolve, 5000)
        })
      })

      // Extra settle time for CSS transitions/blur effects
      await new Promise(r => setTimeout(r, 1000))

      const filepath = resolve(outDir, format.filename)
      await page.screenshot({
        path: filepath,
        type: 'png',
        clip: {
          x: 0,
          y: 0,
          width: format.width,
          height: format.height,
        },
      })

      files[format.name] = filepath
      console.log(`    [screenshot] ${format.name} (${format.width}x${format.height}) → ${format.filename}`)
    }
  } finally {
    await browser.close()
  }

  return files
}

// ─── API fallback (screenshotone.com) ───────────────────
//
// Free tier: 100 screenshots/month. Enough for testing.
// Set SCREENSHOT_API_KEY env var to enable.

async function captureWithAPI(
  url: string,
  slug: string,
  outDir: string
): Promise<Record<string, string>> {
  const apiKey = process.env.SCREENSHOT_API_KEY
  if (!apiKey) {
    throw new Error('No SCREENSHOT_API_KEY for API fallback')
  }

  const files: Record<string, string> = {}

  for (const format of FORMATS) {
    const params = new URLSearchParams({
      access_key: apiKey,
      url,
      viewport_width: String(format.width),
      viewport_height: String(format.height),
      device_scale_factor: '2',
      format: 'png',
      block_ads: 'true',
      delay: '3',
    })

    const response = await fetch(`https://api.screenshotone.com/take?${params}`)

    if (!response.ok) {
      console.error(`    [screenshot] API failed for ${format.name}: ${response.status}`)
      continue
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const filepath = resolve(outDir, format.filename)
    writeFileSync(filepath, buffer)
    files[format.name] = filepath
    console.log(`    [screenshot] ${format.name} (API) → ${format.filename}`)
  }

  return files
}

// ─── Main: capture all formats ──────────────────────────

export async function captureRoom(slug: string, baseUrl: string = 'https://footprint.onl'): Promise<ScreenshotResult> {
  const url = `${baseUrl}/${slug}`
  const outDir = resolve(OUTPUT_BASE, slug)

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true })
  }

  console.log(`  [screenshot] capturing ${url} (4 formats)...`)

  // Try Puppeteer first
  try {
    const files = await captureWithPuppeteer(url, slug, outDir)
    if (Object.keys(files).length === FORMATS.length) {
      console.log(`  [screenshot] all 4 formats captured via Puppeteer`)
      return { slug, dir: outDir, files, method: 'puppeteer' }
    }
    // Partial capture — still return what we got
    if (Object.keys(files).length > 0) {
      console.log(`  [screenshot] ${Object.keys(files).length}/4 formats captured via Puppeteer`)
      return { slug, dir: outDir, files, method: 'puppeteer' }
    }
  } catch (err: any) {
    console.error(`  [screenshot] Puppeteer failed: ${err.message}`)
  }

  // Fallback: API
  console.log(`  [screenshot] trying API fallback...`)
  try {
    const files = await captureWithAPI(url, slug, outDir)
    if (Object.keys(files).length > 0) {
      console.log(`  [screenshot] ${Object.keys(files).length}/4 formats captured via API`)
      return { slug, dir: outDir, files, method: 'api' }
    }
  } catch (err: any) {
    console.error(`  [screenshot] API fallback failed: ${err.message}`)
  }

  // Both failed — return empty but don't crash the pipeline
  console.error(`  [screenshot] FAILED for ${slug} — no screenshots captured`)
  return { slug, dir: outDir, files: {}, method: 'failed' }
}
