import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'JackYun Portal', short_name: 'JackYun', description: '个人学习与效率门户',
    start_url: '/dashboard', scope: '/', display: 'standalone',
    background_color: '#ffffff', theme_color: '#1a73e8', lang: 'zh-CN',
    icons: [
      { src: '/jackyun-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/Webicon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/Webicon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: '今日学习', short_name: '今日学习', url: '/dashboard', icons: [{ src: '/jackyun-icon-192.png', sizes: '192x192' }] },
      { name: '开始专注', short_name: '番茄钟', url: '/pomodoro', icons: [{ src: '/jackyun-icon-192.png', sizes: '192x192' }] },
      { name: '开始复习', short_name: '复习', url: '/review', icons: [{ src: '/jackyun-icon-192.png', sizes: '192x192' }] },
    ],
  };
}
