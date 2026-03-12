/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  turbopack: {},
  experimental: {
    outputFileTracingExcludes: {
      '*': ['./src/fp/agents/**/*', './profiles/**/*'],
    },
  },
}

module.exports = nextConfig
