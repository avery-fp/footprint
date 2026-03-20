#!/usr/bin/env node
/**
 * list-engine.js — Apollo.io contact puller
 *
 * Pulls contacts by vertical from Apollo.io API, deduplicates by email,
 * outputs one CSV per vertical. Handles pagination and rate limiting.
 *
 * Usage:
 *   APOLLO_API_KEY=xxx node scripts/list-engine.js
 *   APOLLO_API_KEY=xxx node scripts/list-engine.js --verticals music,design
 *   APOLLO_API_KEY=xxx node scripts/list-engine.js --max-per-vertical 500
 *
 * Output: ./lists/<vertical>.csv
 */

const fs = require('fs')
const path = require('path')

// ═══════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════

const APOLLO_API_KEY = process.env.APOLLO_API_KEY
if (!APOLLO_API_KEY) {
  console.error('FATAL: APOLLO_API_KEY environment variable required')
  process.exit(1)
}

const APOLLO_BASE = 'https://api.apollo.io/v1'
const PER_PAGE = 100
const MAX_PER_VERTICAL = parseInt(process.env.MAX_PER_VERTICAL || '1000', 10)
const RATE_LIMIT_MS = 1200 // ~50 req/min conservative
const OUTPUT_DIR = path.resolve(process.cwd(), 'lists')

// ═══════════════════════════════════════════
// 20 Verticals — job titles + industries
// ═══════════════════════════════════════════

const VERTICALS = {
  music: {
    titles: ['musician', 'music producer', 'artist manager', 'a&r', 'dj', 'singer', 'songwriter', 'music director', 'band member', 'recording artist'],
    industries: ['music', 'entertainment', 'media production'],
  },
  design: {
    titles: ['graphic designer', 'ui designer', 'ux designer', 'creative director', 'art director', 'brand designer', 'product designer', 'visual designer', 'design lead', 'design director'],
    industries: ['design', 'graphic design', 'information technology and services'],
  },
  photography: {
    titles: ['photographer', 'photo editor', 'studio owner', 'creative photographer', 'portrait photographer', 'commercial photographer', 'photography director', 'visual artist', 'photojournalist'],
    industries: ['photography', 'media production', 'arts and crafts'],
  },
  film: {
    titles: ['filmmaker', 'director', 'cinematographer', 'film producer', 'screenwriter', 'video producer', 'content creator', 'editor', 'videographer', 'showrunner'],
    industries: ['motion pictures and film', 'entertainment', 'media production', 'broadcast media'],
  },
  fitness: {
    titles: ['personal trainer', 'fitness coach', 'gym owner', 'fitness influencer', 'yoga instructor', 'strength coach', 'wellness coach', 'nutrition coach', 'crossfit coach', 'fitness director'],
    industries: ['health wellness and fitness', 'sports', 'recreational facilities and services'],
  },
  gaming: {
    titles: ['game developer', 'streamer', 'esports player', 'content creator', 'game designer', 'community manager', 'twitch streamer', 'gaming influencer', 'esports coach', 'game producer'],
    industries: ['computer games', 'entertainment', 'online media'],
  },
  fashion: {
    titles: ['fashion designer', 'stylist', 'fashion blogger', 'creative director', 'model', 'fashion buyer', 'fashion editor', 'brand manager', 'fashion influencer', 'merchandiser'],
    industries: ['apparel and fashion', 'luxury goods and jewelry', 'retail'],
  },
  art: {
    titles: ['artist', 'sculptor', 'painter', 'gallery owner', 'curator', 'art director', 'illustrator', 'muralist', 'installation artist', 'mixed media artist'],
    industries: ['fine art', 'arts and crafts', 'museums and institutions'],
  },
  tech: {
    titles: ['software engineer', 'founder', 'cto', 'developer advocate', 'tech lead', 'indie hacker', 'product manager', 'startup founder', 'full stack developer', 'engineering manager'],
    industries: ['information technology and services', 'computer software', 'internet'],
  },
  sports: {
    titles: ['athlete', 'sports coach', 'trainer', 'sports agent', 'team manager', 'sports broadcaster', 'sports analyst', 'sports marketer', 'sports influencer', 'scout'],
    industries: ['sports', 'professional training and coaching', 'recreational facilities and services'],
  },
  food: {
    titles: ['chef', 'restaurant owner', 'food blogger', 'food photographer', 'culinary director', 'pastry chef', 'food influencer', 'recipe developer', 'food stylist', 'sommelier'],
    industries: ['food and beverages', 'restaurants', 'hospitality'],
  },
  travel: {
    titles: ['travel blogger', 'travel photographer', 'travel influencer', 'tour guide', 'travel writer', 'adventure guide', 'travel consultant', 'content creator', 'digital nomad', 'travel filmmaker'],
    industries: ['leisure travel and tourism', 'hospitality', 'airlines/aviation'],
  },
  education: {
    titles: ['teacher', 'professor', 'tutor', 'course creator', 'education consultant', 'instructional designer', 'academic', 'educator', 'curriculum developer', 'edtech founder'],
    industries: ['education management', 'e-learning', 'higher education'],
  },
  'real-estate': {
    titles: ['real estate agent', 'broker', 'property developer', 'real estate investor', 'property manager', 'real estate photographer', 'real estate marketer', 'realtor', 'commercial broker', 'real estate consultant'],
    industries: ['real estate', 'commercial real estate', 'construction'],
  },
  crypto: {
    titles: ['crypto trader', 'blockchain developer', 'web3 founder', 'defi analyst', 'nft artist', 'crypto influencer', 'tokenomics designer', 'dao contributor', 'smart contract developer', 'crypto researcher'],
    industries: ['financial services', 'information technology and services', 'computer software'],
  },
  comedy: {
    titles: ['comedian', 'comedy writer', 'stand-up comedian', 'improv performer', 'comedy producer', 'sketch writer', 'humor columnist', 'comedy club owner', 'comedic actor', 'comedy director'],
    industries: ['entertainment', 'performing arts', 'media production'],
  },
  writing: {
    titles: ['writer', 'author', 'journalist', 'copywriter', 'content writer', 'editor', 'blogger', 'technical writer', 'ghostwriter', 'poet'],
    industries: ['writing and editing', 'publishing', 'online media', 'media production'],
  },
  dance: {
    titles: ['dancer', 'choreographer', 'dance instructor', 'dance studio owner', 'ballet dancer', 'dance director', 'dance company founder', 'movement artist', 'dance therapist', 'dance performer'],
    industries: ['performing arts', 'entertainment', 'arts and crafts'],
  },
  beauty: {
    titles: ['makeup artist', 'beauty influencer', 'esthetician', 'hairstylist', 'beauty brand founder', 'nail artist', 'beauty blogger', 'skincare specialist', 'beauty consultant', 'cosmetic chemist'],
    industries: ['cosmetics', 'health wellness and fitness', 'consumer goods'],
  },
  architecture: {
    titles: ['architect', 'interior designer', 'landscape architect', 'urban planner', 'architectural designer', 'design principal', 'architecture photographer', 'sustainable architect', 'visualization artist', 'architectural consultant'],
    industries: ['architecture and planning', 'design', 'construction'],
  },
}

// ═══════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function csvEscape(val) {
  if (val == null) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function csvRow(fields) {
  return fields.map(csvEscape).join(',')
}

const CSV_HEADER = csvRow([
  'email', 'first_name', 'last_name', 'title', 'company',
  'linkedin_url', 'city', 'state', 'country', 'vertical',
])

// ═══════════════════════════════════════════
// Apollo API
// ═══════════════════════════════════════════

async function searchPeople(params, page = 1) {
  const body = {
    api_key: APOLLO_API_KEY,
    page,
    per_page: PER_PAGE,
    person_titles: params.titles,
    person_locations: [],
    q_organization_domains: [],
    organization_industry_tag_ids: [],
    person_seniorities: [],
  }

  // Apollo uses industry keywords in the search
  if (params.industries && params.industries.length > 0) {
    body.q_keywords = params.industries.join(' OR ')
  }

  const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (res.status === 429) {
    console.log('    Rate limited — waiting 60s...')
    await sleep(60000)
    return searchPeople(params, page)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Apollo API ${res.status}: ${text}`)
  }

  const data = await res.json()
  return {
    people: data.people || [],
    totalPages: Math.ceil((data.pagination?.total_entries || 0) / PER_PAGE),
    totalEntries: data.pagination?.total_entries || 0,
  }
}

// ═══════════════════════════════════════════
// Main
// ═══════════════════════════════════════════

async function processVertical(name, config) {
  console.log(`\n▸ ${name} — pulling contacts...`)

  const seen = new Set()
  const contacts = []
  let page = 1

  while (contacts.length < MAX_PER_VERTICAL) {
    const result = await searchPeople(config, page)

    if (result.people.length === 0) break

    for (const person of result.people) {
      const email = (person.email || '').toLowerCase().trim()
      if (!email || seen.has(email)) continue
      seen.add(email)

      contacts.push({
        email,
        first_name: person.first_name || '',
        last_name: person.last_name || '',
        title: person.title || '',
        company: person.organization?.name || '',
        linkedin_url: person.linkedin_url || '',
        city: person.city || '',
        state: person.state || '',
        country: person.country || '',
      })
    }

    console.log(`    page ${page}/${result.totalPages} — ${contacts.length} unique contacts`)

    if (page >= result.totalPages) break
    page++
    await sleep(RATE_LIMIT_MS)
  }

  return contacts
}

function writeCSV(vertical, contacts) {
  const rows = [CSV_HEADER]
  for (const c of contacts) {
    rows.push(csvRow([
      c.email, c.first_name, c.last_name, c.title, c.company,
      c.linkedin_url, c.city, c.state, c.country, vertical,
    ]))
  }

  const filePath = path.join(OUTPUT_DIR, `${vertical}.csv`)
  fs.writeFileSync(filePath, rows.join('\n') + '\n', 'utf-8')
  console.log(`  ✓ ${filePath} — ${contacts.length} contacts`)
}

async function main() {
  // Parse CLI args
  const args = process.argv.slice(2)
  let selectedVerticals = Object.keys(VERTICALS)

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--verticals' && args[i + 1]) {
      selectedVerticals = args[i + 1].split(',').map(v => v.trim())
      i++
    }
    if (args[i] === '--max-per-vertical' && args[i + 1]) {
      // Override via CLI
      process.env.MAX_PER_VERTICAL = args[i + 1]
      i++
    }
  }

  // Validate verticals
  for (const v of selectedVerticals) {
    if (!VERTICALS[v]) {
      console.error(`Unknown vertical: "${v}". Available: ${Object.keys(VERTICALS).join(', ')}`)
      process.exit(1)
    }
  }

  // Ensure output dir
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  // Global dedup across all verticals
  const globalSeen = new Set()
  let totalContacts = 0

  console.log(`list-engine — ${selectedVerticals.length} verticals, max ${MAX_PER_VERTICAL}/vertical`)

  for (const vertical of selectedVerticals) {
    try {
      const contacts = await processVertical(vertical, VERTICALS[vertical])

      // Global dedup
      const deduped = contacts.filter(c => {
        if (globalSeen.has(c.email)) return false
        globalSeen.add(c.email)
        return true
      })

      if (deduped.length > 0) {
        writeCSV(vertical, deduped)
        totalContacts += deduped.length
      } else {
        console.log(`  ⊘ ${vertical} — 0 unique contacts after global dedup`)
      }
    } catch (err) {
      console.error(`  ✗ ${vertical} failed: ${err.message}`)
    }
  }

  console.log(`\n═══ Done — ${totalContacts} total unique contacts across ${selectedVerticals.length} verticals ═══\n`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
