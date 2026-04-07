import { z } from 'zod'
import { RESERVED_SLUGS } from './constants'

// ── Reusable primitives ──

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .transform(v => v.toLowerCase().trim())
  .pipe(z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.'))

export const usernameSchema = z
  .string()
  .min(1, 'Username required')
  .transform(v => v.toLowerCase().trim())
  .pipe(
    z.string()
      .min(3, 'Names must be 3-20 characters.')
      .max(20, 'Names must be 3-20 characters.')
      .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, and hyphens only.')
      .refine(v => !(RESERVED_SLUGS as readonly string[]).includes(v), 'That name is reserved.')
  )

export const passwordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters')

// ── Route schemas ──

export const signupSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
})

export const contentPostSchema = z.object({
  url: z.string().min(1, 'url and footprint_id required'),
  footprint_id: z.string().min(1, 'url and footprint_id required'),
})

export const contentReorderSchema = z.object({
  footprint_id: z.string().min(1, 'footprint_id and updates array required'),
  updates: z.array(z.object({
    id: z.string().min(1, 'Each update must have a string id'),
    position: z.number().int().nonnegative('Each position must be a non-negative integer'),
  })),
})

export const roomsPatchSchema = z.object({
  id: z.string().min(1, 'id required'),
  slug: z.string().optional(),
  hidden: z.boolean().optional(),
  name: z.string().optional(),
  layout: z.enum(['grid', 'mix', 'rail', 'editorial']).optional(),
})

export const roomsPostSchema = z.object({
  serial_number: z.number({ error: 'serial_number and name required' }),
  name: z.string().min(1, 'serial_number and name required'),
  position: z.number().optional(),
  slug: z.string().optional(),
})

export const roomsDeleteSchema = z.object({
  id: z.string().min(1, 'id required'),
  slug: z.string().optional(),
})

export const publishSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('check-username'),
    username: z.string().min(1, 'Username required'),
  }),
  z.object({
    action: z.literal('publish-free'),
    username: z.string().min(1, 'Username and promo code required'),
    promo: z.string().min(1, 'Username and promo code required'),
  }),
  z.object({
    action: z.literal('publish-paid'),
    username: z.string().min(1, 'Username required'),
    return_to: z.string().optional(),
  }),
  z.object({
    action: z.literal('publish'),
    username: z.string().min(1, 'Username required'),
    return_to: z.string().optional(),
  }),
  z.object({
    action: z.literal('finalize'),
    session_id: z.string().min(1, 'Missing session_id or username'),
    username: z.string().min(1, 'Missing session_id or username'),
  }),
])

export const eventsSchema = z.object({
  footprint_id: z.string().min(1, 'footprint_id and event_type required'),
  event_type: z.enum(['visit', 'tile_click', 'referral_visit', 'share', 'conversion'], {
    error: 'Invalid event_type',
  }),
  event_data: z.record(z.string(), z.unknown()).optional(),
})

export const checkoutSchema = z.object({
  email: z.string().optional(),
  slug: z.string().optional(),
  remix_source: z.string().optional(),
  remix_room: z.string().optional(),
  ref: z.string().optional(),
}).refine(d => d.email || d.remix_source, { message: 'Email is required' })

export const checkoutActivateSchema = z.object({
  session_id: z.string().min(1, 'Missing session_id'),
})

export const checkoutFreeSchema = z.object({
  email: z.string().min(1, 'Email required'),
  promo: z.string().min(1, 'Promo code required'),
  ref: z.string().optional(),
})

export const setPasswordSchema = z.object({
  password: passwordSchema,
})

export const tilesPostSchema = z.object({
  slug: z.string().min(1, 'slug and (url or thought) required'),
  url: z.string().optional(),
  thought: z.string().optional(),
  room_id: z.string().optional(),
}).refine(d => d.url || d.thought, { message: 'slug and (url or thought) required' })

export const tilesDeleteSchema = z.object({
  slug: z.string().min(1, 'slug, source (library|links), and id required'),
  source: z.enum(['library', 'links'], { error: 'slug, source (library|links), and id required' }),
  id: z.string().min(1, 'slug, source (library|links), and id required'),
})

export const tilesPutSchema = z.object({
  slug: z.string().min(1, 'slug and positions array required'),
  positions: z.array(z.object({
    id: z.string(),
    source: z.enum(['library', 'links']),
    position: z.number(),
  })).min(1, 'slug and positions array required'),
})

export const tilesPatchSchema = z.object({
  id: z.string().min(1, 'id, source, and slug required'),
  source: z.enum(['library', 'links'], { error: 'id, source, and slug required' }),
  slug: z.string().min(1, 'id, source, and slug required'),
  size: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  aspect: z.enum(['square', 'wide', 'tall', 'auto']).optional(),
  caption: z.string().optional(),
  title: z.string().optional(),
  room_id: z.string().nullable().optional(),
  parent_tile_id: z.string().nullable().optional(),
})

// Container tile creation
export const containerPostSchema = z.object({
  slug: z.string().min(1, 'slug and label required'),
  label: z.string().min(1, 'slug and label required').max(100),
  cover_url: z.string().optional(),
  room_id: z.string().optional(),
})
