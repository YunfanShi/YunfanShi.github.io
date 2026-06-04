import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="zh-CN">
      <head>
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons+Round"
          rel="stylesheet"
        />
        <link rel="icon" type="image/png" sizes="512x512" href="/Webicon.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/Webicon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
