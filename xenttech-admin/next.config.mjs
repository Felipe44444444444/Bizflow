/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  async redirects() {
    return [
      {
        source:      '/agency/leads',
        destination: '/agency/crm',
        permanent:   true,
      },
      {
        source:      '/agency/leads/:path*',
        destination: '/agency/crm',
        permanent:   true,
      },
    ]
  },
}

export default nextConfig
