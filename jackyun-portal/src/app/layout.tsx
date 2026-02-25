import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JackYun Portal',
  description: 'Personal portal for JackYun',
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
      </head>
      <body>{children}</body>
    </html>
  );
}
