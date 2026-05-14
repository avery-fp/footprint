import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/tiles/thumbnail')

const MAX_THUMB_SIZE = 10 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']

/**
 * POST /api/tiles/thumbnail
 *
 * Uploads an image to storage and returns its public URL. Unlike
 * /api/upload/content, this endpoint does NOT insert a row into `library`
 * — the caller (OwnerTileSheet) PATCHes the returned URL onto an existing
 * link tile via tilesPatchSchema.thumbnail_url_override.
 *
 * Body (multipart/form-data): { file, slug }
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const slug = formData.get('slug') as string | null

    if (!file || !slug) {
      return NextResponse.json({ error: 'file and slug required' }, { status: 400 })
    }

    const auth = await getEditAuth(request, slug)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'We support JPG, PNG, GIF, WebP, and HEIC.' }, { status: 400 })
    }

    if (file.size > MAX_THUMB_SIZE) {
      return NextResponse.json({ error: 'Images under 10MB.' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const { data: footprint } = await supabase
      .from('footprints')
      .select('serial_number')
      .eq('username', slug)
      .single()

    if (!footprint) {
      return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
    }

    const ext = file.name.split('.').pop() || 'jpg'
    const filename = `${footprint.serial_number}/thumb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('content')
      .upload(filename, buffer, { contentType: file.type, upsert: false })

    if (uploadError) {
      log.error({ err: uploadError }, 'Thumbnail upload failed')
      return NextResponse.json({ error: 'Upload hiccuped. Try again.' }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('content').getPublicUrl(filename)
    const url = urlData.publicUrl.replace(/[\n\r]/g, '')

    return NextResponse.json({ url })
  } catch (error) {
    log.error({ err: error }, 'Thumbnail upload failed')
    return NextResponse.json({ error: 'Upload hiccuped. Try again.' }, { status: 500 })
  }
}
