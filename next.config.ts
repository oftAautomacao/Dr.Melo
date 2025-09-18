import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
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
    allowedDevOrigins: [
 'regex:^https?://\\d+-[a-z0-9-]+\\.cloudworkstations\\.dev(:\\d+)?$',
    ],
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
