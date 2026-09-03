import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'JackYun Portal', short_name: 'JackYun', description: '个人学习与效率门户',
    start_url: '/dashboard', scope: '/', display: 'standalone',
    background_color: '#ffffff', theme_color: '#1a73e8',
    icons: [
      { src: '/Webicon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/jackyun-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
