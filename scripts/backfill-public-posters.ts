#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { mediaTypeFromUrl } from '@/lib/media'

const BATCH_SIZE_DEFAULT = 25
const PUBLIC_OBJECT_PREFIX = '/storage/v1/object/public/'
const PUBLIC_RENDER_PREFIX = '/storage/v1/render/image/public/'

function loadDotEnvLocal() {
  const file = resolvePath(process.cwd(), '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function parseArgs(argv: string[]) {
  let write = false
  let batchSize = BATCH_SIZE_DEFAULT
  const extras: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--write') {
      write = true
      continue
    }
    if (arg === '--batch-size') {
      const next = argv[i + 1]
      if (next && /^\d+$/.test(next)) {
        batchSize = Math.max(1, Number(next))
        i += 1
        continue
      }
    }
    extras.push(arg)
  }

  return { write, batchSize, extras }
}

function buildDerivativeUrl(sourcePublicUrl: string) {
  const clean = (sourcePublicUrl || '').replace(/[\n\r]/g, '').trim()
  if (!clean.includes(PUBLIC_OBJECT_PREFIX)) return null
  const base = clean.split('?')[0]
  return `${base.replace(PUBLIC_OBJECT_PREFIX, PUBLIC_RENDER_PREFIX)}?width=960&quality=75`
}

function isProbablyImage(url: string) {
  return mediaTypeFromUrl(url) === 'image'
}

function isProbablyVideo(url: string) {
  return mediaTypeFromUrl(url) === 'video'
}

function logSample(rows: any[]) {
  for (const row of rows) {
    console.log(`- ${row.id} ${row.image_url}`)
  }
}

async function main() {
  loadDotEnvLocal()
  const { write, batchSize } = parseArgs(process.argv.slice(2))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: rows, error } = await supabase
    .schema('public')
    .from('library')
    .select('id, image_url, public_poster_url, serial_number, position, room_id, created_at')
    .not('image_url', 'is', null)
    .is('public_poster_url', null)
    .order('position', { ascending: true })

  if (error) {
    console.error(`Failed to load rows: ${error.message}`)
    process.exit(1)
  }

  const candidates = (rows || []).filter((row) => {
    const url = row.image_url || ''
    return isProbablyImage(url) && !isProbablyVideo(url)
  })

  console.log(`Found ${candidates.length} backfillable library rows with missing public_poster_url`)
  console.log(`Mode: ${write ? 'write' : 'dry-run'} | batch size: ${batchSize}`)
  if (candidates.length > 0) {
    console.log('Sample rows:')
    logSample(candidates.slice(0, Math.min(5, candidates.length)))
  }

  if (!write) {
    console.log('Dry run only. Re-run with --write to backfill.')
    return
  }

  let success = 0
  let failed = 0

  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize)
    console.log(`\nBatch ${Math.floor(offset / batchSize) + 1} (${batch.length} rows)`)

    for (const row of batch) {
      const source = (row.image_url || '').replace(/[\n\r]/g, '').trim()
      const derivativeUrl = buildDerivativeUrl(source)
      if (!derivativeUrl) {
        failed += 1
        console.log(`FAIL ${row.id}: unsupported source URL`)
        continue
      }

      try {
        const response = await fetch(derivativeUrl)
        if (!response.ok) {
          failed += 1
          console.log(`FAIL ${row.id}: derivative fetch HTTP ${response.status}`)
          continue
        }

        const bytes = Buffer.from(await response.arrayBuffer())
        const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim() || 'image/jpeg'
        const ext = contentType.includes('png')
          ? 'png'
          : contentType.includes('webp')
          ? 'webp'
          : 'jpg'
        const posterPath = `${row.serial_number}/posters/${row.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('content')
          .upload(posterPath, bytes, { contentType, upsert: false })

        if (uploadError) {
          failed += 1
          console.log(`FAIL ${row.id}: upload failed (${uploadError.message})`)
          continue
        }

        const { data: posterUrlData } = supabase.storage.from('content').getPublicUrl(posterPath)
        const publicPosterUrl = posterUrlData.publicUrl.replace(/[\n\r]/g, '')

        const { error: updateError } = await supabase
          .schema('public')
          .from('library')
          .update({ public_poster_url: publicPosterUrl })
          .eq('id', row.id)
          .is('public_poster_url', null)

        if (updateError) {
          failed += 1
          console.log(`FAIL ${row.id}: DB update failed (${updateError.message})`)
          continue
        }

        success += 1
        console.log(`OK ${row.id}: ${publicPosterUrl}`)
      } catch (err: any) {
        failed += 1
        console.log(`FAIL ${row.id}: ${err?.message || String(err)}`)
      }
    }
  }

  console.log(`\nDone. success=${success} failed=${failed} total=${candidates.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
