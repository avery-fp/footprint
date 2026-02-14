import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/user
 * 
 * Returns the current authenticated user's data.
 * Used by the dashboard and other protected pages.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, serial_number, created_at, password_hash')
      .eq('id', userId)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Don't send password_hash to client, just whether it exists
    const { password_hash, ...safeUser } = user
    return NextResponse.json({ user: { ...safeUser, has_password: !!password_hash } })

  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}
