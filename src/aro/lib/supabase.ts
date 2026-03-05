/**
 * ARO Supabase client — single safe entrypoint.
 *
 * Every ARO module imports getSupabase() from here instead of
 * constructing its own client with bare non-null assertions.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  _client = createClient(url, key)
  return _client
}
