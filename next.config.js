/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: 'i.scdn.co' },
      { protocol: 'https', hostname: '**.twimg.com' },
      { protocol: 'https', hostname: '**.cdninstagram.com' },
    ],
  },
}

module.exports = nextConfig
