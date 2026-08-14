import type { Metadata } from 'next';
import './globals.css';
import ThemeProvider from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'JackYun Portal',
  description: 'Personal portal for JackYun',
  icons: {
    icon: { url: '/Webicon.png', sizes: '512x512', type: 'image/png' },
    apple: { url: '/Webicon.png', sizes: '512x512', type: 'image/png' },
  },
};

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
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons+Round"
          rel="stylesheet"
        />
        <link rel="icon" type="image/png" sizes="512x512" href="/Webicon.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/Webicon.png" />
      </head>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
