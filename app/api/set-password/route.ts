import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as bcrypt from 'bcryptjs'
import { getUserIdFromRequest } from '@/lib/auth'
import { setPasswordSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/set-password')

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const v = validateBody(setPasswordSchema, body)
    if (!v.success) return v.response
    const { password } = v.data

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const hash = await bcrypt.hash(password, 10)

    const { error } = await supabase
      .from('users')
      .update({ password_hash: hash })
      .eq('id', userId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    log.error({ err }, 'Set password failed')
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
