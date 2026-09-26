import type { Metadata, Viewport } from 'next';
import './globals.css';
import ThemeProvider from '@/components/theme-provider';
import DeploymentRecovery from '@/components/layout/deployment-recovery';
import PwaLifecycle from '@/components/layout/pwa-lifecycle';

export const metadata: Metadata = {
  title: 'JackYun Portal',
  description: 'Personal portal for JackYun',
  appleWebApp: { capable: true, title: 'JackYun', statusBarStyle: 'default' },
  icons: {
    icon: { url: '/Webicon.png', sizes: '512x512', type: 'image/png' },
    apple: { url: '/Webicon.png', sizes: '512x512', type: 'image/png' },
  },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1a73e8', interactiveWidget: 'resizes-content' };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var s=localStorage.getItem('jackyun_theme'),t=s==='gray'||s==='dark'?s:'light';document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t==='light'?'light':'dark'}catch(e){}",
          }}
        />
        <link rel="icon" type="image/png" sizes="512x512" href="/Webicon.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/Webicon.png" />
      </head>
      <body><DeploymentRecovery /><PwaLifecycle /><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
