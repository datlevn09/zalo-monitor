import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Disable CDN cache cho các page động (super-admin, dashboard, login, setup, register).
  // Lý do: Cloudflare từng cache HTML stale tham chiếu JS chunks cũ sau khi rebuild
  // → browser không load được chunks → "This page couldn't load".
  // Static assets trong /_next/static/ vẫn được cache (nội dung của chúng có hash filename).
  async headers() {
    const noStore = [
      { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
      { key: 'CDN-Cache-Control', value: 'no-store' },
    ]
    const dynamicPaths = [
      '/super-admin/:path*', '/super-admin',
      '/dashboard/:path*', '/dashboard',
      '/login', '/register', '/setup', '/setup/:path*',
      '/forgot-password', '/reset-password', '/reset-password/:path*',
    ]
    return dynamicPaths.map(source => ({ source, headers: noStore }))
  },
};

export default nextConfig;
