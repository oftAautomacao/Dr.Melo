import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  outputFileTracingRoot: path.resolve(__dirname),
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    // allowedDevOrigins removed as it is unrecognized in this Next.js version and not needed for local Windows dev
  },
  webpack(config, { dev }) {
    // O cache de producao pode ultrapassar 1 GB e o Firebase cria outra copia
    // temporaria durante o deploy. Desativa-lo evita ENOSPC sem afetar o runtime.
    if (!dev) {
      config.cache = false;
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)', // This applies the headers to all routes
        headers: [
          { key: 'Permissions-Policy', value: 'usb=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
