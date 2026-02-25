import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'

/**
 * POST /api/upload
 * 
 * Handles avatar image uploads using Supabase Storage.
 * 
 * The flow:
 * 1. Receive the image file from the client
 * 2. Validate it's an image and not too large
 * 3. Upload to Supabase Storage bucket
 * 4. Get the public URL
 * 5. Update the user's footprint with the new avatar URL
 * 
 * We store avatars in a public bucket so they can be displayed
 * on the public footprint pages without authentication.
 */

// Max file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024

// Allowed MIME types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export async function POST(request: NextRequest) {
  try {
    // Get user ID from middleware
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse the form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const footprintId = formData.get('footprint_id') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!footprintId) {
      return NextResponse.json({ error: 'footprint_id required' }, { status: 400 })
    }

    // Validate file type (client-reported MIME first, then magic bytes)
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Use JPG, PNG, GIF, or WebP.' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400 }
      )
    }

    // Validate actual file content via magic bytes (prevents MIME spoofing)
    const headerBytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    const isJPEG = headerBytes[0] === 0xFF && headerBytes[1] === 0xD8 && headerBytes[2] === 0xFF
    const isPNG = headerBytes[0] === 0x89 && headerBytes[1] === 0x50 && headerBytes[2] === 0x4E && headerBytes[3] === 0x47
    const isGIF = headerBytes[0] === 0x47 && headerBytes[1] === 0x49 && headerBytes[2] === 0x46
    const isWebP = headerBytes[0] === 0x52 && headerBytes[1] === 0x49 && headerBytes[2] === 0x46 && headerBytes[3] === 0x46
      && headerBytes[8] === 0x57 && headerBytes[9] === 0x45 && headerBytes[10] === 0x42 && headerBytes[11] === 0x50

    if (!isJPEG && !isPNG && !isGIF && !isWebP) {
      return NextResponse.json(
        { error: 'File content does not match an allowed image format.' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Verify user owns this footprint
    const { data: footprint } = await supabase
      .from('footprints')
      .select('user_id, username')
      .eq('id', footprintId)
      .single()

    if (!footprint || footprint.user_id !== userId) {
      return NextResponse.json({ error: 'Not your footprint' }, { status: 403 })
    }

    // Generate a unique filename
    const ext = file.name.split('.').pop() || 'jpg'
    const filename = `${userId}/${footprintId}-${Date.now()}.${ext}`

    // Convert File to ArrayBuffer then to Buffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true, // Overwrite if exists
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filename)

    const avatarUrl = urlData.publicUrl

    // Update the footprint with the new avatar URL
    const { error: updateError } = await supabase
      .from('footprints')
      .update({ avatar_url: avatarUrl })
      .eq('id', footprintId)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Failed to save avatar' }, { status: 500 })
    }

    if (footprint.username) revalidatePath(`/${footprint.username}`)

    return NextResponse.json({
      success: true,
      avatar_url: avatarUrl
    })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
