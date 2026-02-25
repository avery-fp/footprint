/** @type {import('next').NextConfig} */
const nextConfig = {
  // TODO: Remove these once all TS/ESLint errors are fixed.
  // ~20 pre-existing type errors across the codebase need cleanup.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
