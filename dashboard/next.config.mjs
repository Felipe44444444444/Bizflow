/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  env: {
    NEXT_PUBLIC_API_URL:    process.env.NEXT_PUBLIC_API_URL    || 'http://localhost:3000',
    NEXT_PUBLIC_WIDGET_URL: process.env.NEXT_PUBLIC_WIDGET_URL || 'http://localhost:5173/dist/widget.min.js',
  },
  // COOP/COEP headers required by ffmpeg.wasm SharedArrayBuffer — scoped to clips page only
  async headers() {
    return [
      {
        source: '/agency/clips',
        headers: [
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin'  },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

export default nextConfig;

