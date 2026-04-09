import { createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'

type PendingCookie =
  | { type: 'set'; value: string; options?: Record<string, unknown> }
  | { type: 'remove'; options?: Record<string, unknown> }

function requireEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export function getCanonicalAppBaseUrl(request?: NextRequest) {
  const raw = process.env.NEXT_PUBLIC_APP_URL || request?.nextUrl.origin || 'https://www.footprint.onl'
  const url = new URL(raw)

  if (url.hostname === 'footprint.onl') {
    url.hostname = 'www.footprint.onl'
  }

  return url.origin
}

export function createRouteHandlerSupabaseAuthClient(request: NextRequest) {
  const pendingCookies = new Map<string, PendingCookie>()

  const supabase = createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        get(name: string) {
          const pending = pendingCookies.get(name)
          if (pending?.type === 'set') return pending.value
          if (pending?.type === 'remove') return undefined
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          pendingCookies.set(name, { type: 'set', value, options })
        },
        remove(name: string, options: CookieOptions) {
          pendingCookies.set(name, { type: 'remove', options })
        },
      },
    }
  )

  function applyPendingCookies(response: NextResponse) {
    pendingCookies.forEach((pending, name) => {
      if (pending.type === 'remove') {
        response.cookies.set(name, '', {
          ...(pending.options as Record<string, unknown>),
          maxAge: 0,
        })
        return
      }

      response.cookies.set(name, pending.value, pending.options as Record<string, unknown>)
    })

    return response
  }

  return { supabase, applyPendingCookies }
}
