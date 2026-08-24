import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/api/companion/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'chrome-extension://nlckikhapgbekdclakobfopdihiibafl' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type' },
          { key: 'Vary', value: 'Origin' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/temp/:slug*',
        destination: '/:slug*.html',
      },
    ];
  },
};

export default nextConfig;
