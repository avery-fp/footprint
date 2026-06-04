const ICONS = [
  {
    src: '/apple-touch-icon-180x180.png',
    sizes: '180x180',
    type: 'image/png',
  },
  {
    src: '/icon-192.png',
    sizes: '192x192',
    type: 'image/png',
  },
  {
    src: '/apple-touch-icon.png',
    sizes: '512x512',
    type: 'image/png',
  },
  {
    src: '/icon-transparent.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
]

const RESERVED_SLUGS = new Set([
  'build',
  'login',
  'signup',
  'signin',
  'auth',
  'checkout',
  'success',
  'deed',
  'gift',
  'public',
  'api',
  'preview',
])

export const dynamic = 'force-static'
export const revalidate = 3600

export function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  const slug = encodeURIComponent(params.slug)
  const isReserved = RESERVED_SLUGS.has(params.slug)
  const startUrl = isReserved ? '/' : `/${slug}`
  const scope = isReserved ? '/' : `/${slug}`
  const id = isReserved ? '/' : `/footprint/${slug}`

  return Response.json({
    id,
    name: isReserved ? 'Footprint' : `Footprint / ${params.slug}`,
    short_name: 'Footprint',
    description: 'one page for everything.',
    start_url: startUrl,
    scope,
    display: 'standalone',
    background_color: '#050505',
    theme_color: '#050505',
    launch_handler: {
      client_mode: 'focus-existing',
    },
    icons: ICONS,
  })
}
