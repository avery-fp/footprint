/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      // Short, memorable CAN-SPAM unsubscribe URL used in email footers
      // (src/aro/mirror.ts → buildUnsubscribeUrl). The actual handler lives
      // at /api/aro/unsubscribe/route.ts. The rewrite preserves query
      // params, so /aro/u?t=<token> becomes /api/aro/unsubscribe?t=<token>.
      {
        source: '/aro/u',
        destination: '/api/aro/unsubscribe',
      },
    ]
  },
}

module.exports = nextConfig
