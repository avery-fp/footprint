/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  turbopack: {},
  outputFileTracingExcludes: {
    '*': ['./src/fp/agents/**'],
  },
}

module.exports = nextConfig
