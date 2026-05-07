import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// Placeholder values used during build-time static analysis when env vars
// aren't available. Pages that use Supabase should set
// `export const dynamic = 'force-dynamic'` so these are never hit at runtime.
const PLACEHOLDER_URL = 'http://localhost'
const PLACEHOLDER_KEY = 'placeholder'

// Trim defensively. A trailing newline pasted into the Vercel env-var UI
// once silently broke every tile upload — embedded \x0A in derived URLs
// tripped server-side control-char regexes. .trim() makes the central
// factory robust against future env-var foot-guns.
const env = (name: string): string => (process.env[name] || '').trim()

// Browser client (for client components)
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    env('NEXT_PUBLIC_SUPABASE_URL') || PLACEHOLDER_URL,
    env('NEXT_PUBLIC_SUPABASE_ANON_KEY') || PLACEHOLDER_KEY
  )
}

// Server client with service role (for API routes)
export function createServerSupabaseClient() {
  return createClient(
    env('NEXT_PUBLIC_SUPABASE_URL') || PLACEHOLDER_URL,
    env('SUPABASE_SERVICE_ROLE_KEY') || PLACEHOLDER_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

// Types
export interface User {
  id: string
  email: string
  serial_number: number
  created_at: string
}

export interface Footprint {
  id: string
  user_id: string
  slug: string
  name: string
  icon: string
  is_primary: boolean
  is_public: boolean
  display_name: string | null
  handle: string | null
  bio: string | null
  avatar_url: string | null
  view_count: number
  created_at: string
}

export interface Content {
  id: string
  footprint_id: string
  url: string
  type: string
  title: string | null
  description: string | null
  thumbnail_url: string | null
  embed_html: string | null
  external_id: string | null
  position: number
  size?: number
  aspect?: string | null
  created_at: string
}
