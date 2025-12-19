import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// Browser client (for client components)
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Server client with service role (for API routes)
export function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
  created_at: string
}
