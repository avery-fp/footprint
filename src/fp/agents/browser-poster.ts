/**
 * BROWSER POSTER — Puppeteer-based Reddit posting with persistent Chrome profiles.
 *
 * Each Reddit account gets its own Chrome user-data directory at:
 *   profiles/reddit/{username}/chrome-data/
 *
 * First run opens a visible browser per account for manual login.
 * Subsequent runs reuse the session cookies from the profile.
 *
 * Pulls drafts from the deploy-queue/reddit/ directory or accepts
 * PostpackOutput directly.
 */

import { mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync } from 'fs'
import { resolve } from 'path'
import type { PostpackOutput } from './postpack.js'

// ─── Types ──────────────────────────────────────────────

export interface RedditAccount {
  username: string
  password: string
  profileDir: string
  assignedSubs: string[]
}

export interface BrowserPosterOptions {
  headless?: boolean
  draftDir?: string
}

// ─── Account discovery from env ─────────────────────────

export function loadRedditAccounts(): RedditAccount[] {
  const accounts: RedditAccount[] = []

  for (let i = 1; i <= 20; i++) {
    const username = process.env[`REDDIT_ACCOUNT_${i}_USERNAME`]
    const password = process.env[`REDDIT_ACCOUNT_${i}_PASSWORD`]
    if (!username || !password) continue

    const profileDir = resolve(process.cwd(), 'profiles', 'reddit', username, 'chrome-data')
    mkdirSync(profileDir, { recursive: true })

    accounts.push({ username, password, profileDir, assignedSubs: [] })
  }

  return accounts
}

// ─── Subreddit assignment ───────────────────────────────
//
// Split the subreddit list across accounts so no two accounts
// post in the same subreddit.

const ALL_SUBS = [
  'nba', 'basketball', 'chicagobulls', 'nbadiscussion',
  'hiphopheads', 'MacMiller', 'FrankOcean', 'spotify', 'musicproduction',
  'streetwear', 'malefashion', 'sneakers', 'fashionreps',
  'anime', 'manga', 'animeart',
  'movies', 'criterion', 'TrueFilm', 'davidlynch', 'A24',
  'web_design', 'design', 'InternetIsBeautiful', 'minimalism', 'architecture',
  'internetculture', 'aesthetics', 'vaporwave', 'Art',
  'SideProject', 'webdev', 'IndieHackers', 'startups', 'Entrepreneur',
  'pics', 'interestingasfuck', 'nextfuckinglevel', 'coolguides',
]

export function assignSubreddits(accounts: RedditAccount[]): void {
  if (accounts.length === 0) return

  for (let i = 0; i < ALL_SUBS.length; i++) {
    const accountIndex = i % accounts.length
    accounts[accountIndex].assignedSubs.push(ALL_SUBS[i])
  }
}

// ─── Draft queue reader ─────────────────────────────────

interface QueuedDraft {
  filepath: string
  comment_text: string
  target_url: string
  thread_title: string
  context: string
  room_url: string
}

function readDraftQueue(draftDir: string): QueuedDraft[] {
  const dir = resolve(draftDir, 'reddit')
  if (!existsSync(dir)) return []

  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort()
  const drafts: QueuedDraft[] = []

  for (const file of files) {
    try {
      const filepath = resolve(dir, file)
      const data = JSON.parse(readFileSync(filepath, 'utf-8'))
      drafts.push({ filepath, ...data })
    } catch {
      // skip malformed files
    }
  }

  return drafts
}

// ─── Browser posting via Puppeteer ──────────────────────

async function postWithBrowser(
  account: RedditAccount,
  drafts: QueuedDraft[],
  opts: BrowserPosterOptions
): Promise<{ posted: number; failed: number; rateLimited: boolean }> {
  // Dynamic import — puppeteer may not be installed in all envs
  let puppeteer: typeof import('puppeteer')
  try {
    puppeteer = await import('puppeteer')
  } catch {
    console.error(`  [browser] puppeteer not installed, run: npm i puppeteer`)
    return { posted: 0, failed: drafts.length, rateLimited: false }
  }

  const browser = await puppeteer.default.launch({
    headless: opts.headless ?? false,
    userDataDir: account.profileDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  let posted = 0
  let failed = 0
  let rateLimited = false

  try {
    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    // Check if logged in by visiting reddit
    await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await sleep(2000)

    // Check for login state
    const isLoggedIn = await page.evaluate(() => {
      // Reddit shows username in the page when logged in
      return document.cookie.includes('reddit_session') ||
        !!document.querySelector('[data-testid="user-drawer-button"]') ||
        !!document.querySelector('#USER_DROPDOWN_ID')
    })

    if (!isLoggedIn) {
      console.log(`  [browser] ${account.username}: not logged in — browser opened for manual login`)
      console.log(`  [browser] ${account.username}: log in manually, then restart the runner`)
      // Keep browser open for manual login
      await sleep(60000)
      await browser.close()
      return { posted: 0, failed: 0, rateLimited: false }
    }

    console.log(`  [browser] ${account.username}: session active, processing ${drafts.length} drafts`)

    for (const draft of drafts) {
      // Check if this draft's subreddit is assigned to this account
      const subMatch = draft.context?.match(/r\/(\w+)/)
      if (subMatch) {
        const sub = subMatch[1]
        if (!account.assignedSubs.some(s => s.toLowerCase() === sub.toLowerCase())) {
          continue // not our sub
        }
      }

      try {
        // Navigate to the thread
        await page.goto(draft.target_url, { waitUntil: 'domcontentloaded', timeout: 15000 })
        await sleep(2000 + Math.random() * 3000) // human-like delay

        // Find and click the comment box
        const commentBox = await page.$('[data-testid="comment-composer-body"] div[contenteditable="true"]')
          || await page.$('.public-DraftEditor-content')
          || await page.$('div[role="textbox"]')

        if (!commentBox) {
          console.log(`  [browser] ${account.username}: no comment box found on ${draft.context}`)
          failed++
          continue
        }

        await commentBox.click()
        await sleep(500)
        await commentBox.type(draft.comment_text, { delay: 30 + Math.random() * 50 })
        await sleep(1000)

        // Click submit
        const submitBtn = await page.$('button[type="submit"]')
          || await page.$('[data-testid="comment-submission-form-submit"]')

        if (!submitBtn) {
          console.log(`  [browser] ${account.username}: no submit button on ${draft.context}`)
          failed++
          continue
        }

        await submitBtn.click()
        await sleep(3000)

        // Check for rate limit message
        const pageContent = await page.content()
        if (pageContent.includes('you are doing that too much') || pageContent.includes('RATELIMIT')) {
          console.log(`  [browser] ${account.username}: rate limited`)
          rateLimited = true
          break
        }

        // Remove the draft file after successful post
        try { unlinkSync(draft.filepath) } catch { /* ok */ }

        posted++
        console.log(`  [browser] ${account.username}: posted on ${draft.context} ✓`)

        // Delay between posts (10-30s to look human)
        await sleep(10000 + Math.random() * 20000)
      } catch (err: any) {
        console.error(`  [browser] ${account.username}: error on ${draft.context}: ${err.message}`)
        failed++
      }
    }

    await page.close()
  } finally {
    await browser.close()
  }

  return { posted, failed, rateLimited }
}

// ─── Main: run poster for a single account ──────────────

export async function runPoster(
  account: RedditAccount,
  opts: BrowserPosterOptions = {}
): Promise<{ posted: number; failed: number; rateLimited: boolean }> {
  const draftDir = opts.draftDir || resolve(process.cwd(), 'deploy-queue')
  const drafts = readDraftQueue(draftDir)

  if (drafts.length === 0) {
    console.log(`  [browser] ${account.username}: no drafts in queue`)
    return { posted: 0, failed: 0, rateLimited: false }
  }

  // Filter to drafts for this account's assigned subs
  const myDrafts = drafts.filter(d => {
    const subMatch = d.context?.match(/r\/(\w+)/)
    if (!subMatch) return false
    return account.assignedSubs.some(s => s.toLowerCase() === subMatch[1].toLowerCase())
  })

  if (myDrafts.length === 0) {
    console.log(`  [browser] ${account.username}: no drafts for assigned subs`)
    return { posted: 0, failed: 0, rateLimited: false }
  }

  console.log(`  [browser] ${account.username}: ${myDrafts.length} drafts for ${account.assignedSubs.length} subs`)
  return postWithBrowser(account, myDrafts, opts)
}

// ─── Post directly (not from queue) ─────────────────────

export async function postDirect(
  account: RedditAccount,
  output: PostpackOutput,
  opts: BrowserPosterOptions = {}
): Promise<{ posted: boolean; rateLimited: boolean }> {
  const draft: QueuedDraft = {
    filepath: '',
    comment_text: output.comment_text,
    target_url: output.target_url,
    thread_title: output.thread_title,
    context: output.context,
    room_url: output.metadata.room_url,
  }

  const result = await postWithBrowser(account, [draft], opts)
  return { posted: result.posted > 0, rateLimited: result.rateLimited }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
