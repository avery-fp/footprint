import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const messages = []

await page.goto(`https://www.footprint.onl/ae?music-audio-smoke=c2a0ccd-${Date.now()}`, {
  waitUntil: 'networkidle',
  timeout: 20000,
}).catch(() => {})

await page.exposeFunction('recordYtMessage', (message) => messages.push(message))
await page.evaluate(() => {
  window.addEventListener('message', (event) => {
    if (!/youtube/.test(event.origin || '')) return
    let data = event.data
    try {
      if (typeof data === 'string') data = JSON.parse(data)
    } catch {}
    window.recordYtMessage(data)
  })
})

await page.getByRole('button', { name: 'sound', exact: true }).click({ timeout: 5000 }).catch(() => {})
await page.waitForTimeout(1800)

const before = await page.evaluate(() => {
  const yt = document.querySelector('[data-tile-type="youtube"]')
  if (!yt) return null
  const r = yt.getBoundingClientRect()
  const iframe = yt.querySelector('iframe')
  const wrapper = iframe?.parentElement
  const poster = yt.querySelector('button[aria-label="Play video"]')
  return {
    id: yt.getAttribute('data-tile-id'),
    hasIframe: !!iframe,
    iframeOpacity: wrapper ? getComputedStyle(wrapper).opacity : null,
    posterExists: !!poster,
    posterPointer: poster ? getComputedStyle(poster).pointerEvents : null,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    outboundYoutube: [...document.querySelectorAll('a')].filter((a) => /youtu\.?be|youtube/i.test(a.href)).length,
  }
})

if (before?.id) {
  await page.locator(`[data-tile-id="${before.id}"]`).click({ timeout: 5000, force: true }).catch(() => {})
}
await page.waitForTimeout(7000)

const after = before?.id
  ? await page.evaluate((id) => {
      const yt = document.querySelector(`[data-tile-id="${id}"]`)
      const iframe = yt?.querySelector('iframe')
      const wrapper = iframe?.parentElement
      const poster = yt?.querySelector('button[aria-label="Play video"]')
      return {
        id,
        hasIframe: !!iframe,
        iframeOpacity: wrapper ? getComputedStyle(wrapper).opacity : null,
        posterExists: !!poster,
        posterPointer: poster ? getComputedStyle(poster).pointerEvents : null,
        outboundYoutube: [...document.querySelectorAll('a')].filter((a) => /youtu\.?be|youtube/i.test(a.href)).length,
        url: location.href,
      }
    }, before.id)
  : null

const playingMessageSeen = messages.some(
  (m) =>
    m &&
    ((m.event === 'onStateChange' && m.info === 1) ||
      (m.event === 'infoDelivery' && m.info && m.info.playerState === 1))
)

console.log(JSON.stringify({ before, after, playingMessageSeen, messageCount: messages.length, sampleMessages: messages.slice(-8) }, null, 2))
await browser.close()
