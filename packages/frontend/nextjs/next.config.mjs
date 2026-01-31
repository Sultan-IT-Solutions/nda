/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from normalizing trailing slashes via redirects.
  // Without this, `/api/foo/` -> 308 `/api/foo` and FastAPI then redirects
  // `/foo` -> `/foo/` with an absolute Location pointing to `localhost:8001`,
  // which makes the browser jump cross-origin and breaks HttpOnly cookie auth.
  skipTrailingSlashRedirect: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8001';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
}

export default nextConfig
