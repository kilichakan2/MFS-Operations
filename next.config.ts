import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: { typedRoutes: true },
  async redirects() {
    // permanent: false emits HTTP 307 (Next.js standard). 307 is
    // the spec-strict "temporary, preserve method" counterpart to
    // legacy 302 — user-observable behavior is identical for GET
    // redirects. Rollback-safe (not cached by default). Will flip
    // to permanent: true (HTTP 308) ~1 week post-merge.
    return [
      { source: '/screen1', destination: '/dispatch', permanent: false },
      { source: '/screen4', destination: '/dashboard/admin', permanent: false },
      { source: '/screen5', destination: '/admin', permanent: false },
      { source: '/screen5/:path*', destination: '/admin/:path*', permanent: false },
      { source: '/screen6', destination: '/map', permanent: false },
    ]
  },
}

export default nextConfig
