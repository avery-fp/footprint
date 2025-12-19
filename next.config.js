/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: ['i.ytimg.com', 'i.scdn.co', 'pbs.twimg.com', 'images.unsplash.com'],
  },
}

module.exports = nextConfig
