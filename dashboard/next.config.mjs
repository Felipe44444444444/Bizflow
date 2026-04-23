/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone' is for self-hosting (Docker/Railway direct).
  // Vercel builds Next.js its own way — do NOT set this when deploying to Vercel.
  env: {
    NEXT_PUBLIC_API_URL:    process.env.NEXT_PUBLIC_API_URL    || 'http://localhost:3000',
    NEXT_PUBLIC_WIDGET_URL: process.env.NEXT_PUBLIC_WIDGET_URL || 'http://localhost:5173/dist/widget.min.js',
  },
};

export default nextConfig;

