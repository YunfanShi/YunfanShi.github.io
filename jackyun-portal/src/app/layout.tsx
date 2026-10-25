import { workspaceStorage } from '@/lib/sync/repository';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import './device-workspace.css';
import Script from 'next/script';
import ThemeProvider from '@/components/theme-provider';
import DeploymentRecovery from '@/components/layout/deployment-recovery';
import PwaLifecycle from '@/components/layout/pwa-lifecycle';
import ClientLoggerBoot from '@/components/layout/client-logger-boot';

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
            __html: "try{var s=workspaceStorage.getItem('jackyun_theme'),t=s==='gray'||s==='dark'?s:'light';document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t==='light'?'light':'dark'}catch(e){}",
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('input',function(e){var t=e.target,k=t&&t.getAttribute&&t.getAttribute('data-jy-early-input');if(k){(window.__JY_EARLY_INPUTS||(window.__JY_EARLY_INPUTS={}))[k]=t.value;window.dispatchEvent(new CustomEvent('jy-early-input',{detail:{key:k,value:t.value}}))}},true);
var jyEarlyClickReady=window.__JY_EARLY_CLICK_READY||(window.__JY_EARLY_CLICK_READY={});
document.addEventListener('click',function(e){var target=e.target&&e.target.closest?e.target.closest('[data-jy-early-click]'):null;if(!target)return;var key=target.getAttribute('data-jy-early-click');if(!key||jyEarlyClickReady[key])return;e.preventDefault();e.stopPropagation();var queue=window.__JY_EARLY_CLICK_QUEUE||(window.__JY_EARLY_CLICK_QUEUE={});if(!queue[key])queue[key]=target},true);
window.addEventListener('jy-early-click-ready',function(e){var key=e.detail&&e.detail.key;if(!key)return;jyEarlyClickReady[key]=true;var queue=window.__JY_EARLY_CLICK_QUEUE,target=queue&&queue[key];if(queue)delete queue[key];if(target){var current=document.querySelectorAll('[data-jy-early-click]');for(var i=0;i<current.length;i++){if(current[i].getAttribute('data-jy-early-click')===key){target=current[i];break}}if(target.isConnected)requestAnimationFrame(function(){target.click()})}});`,
          }}
        />
        <link rel="icon" type="image/png" sizes="512x512" href="/Webicon.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/Webicon.png" />
      </head>
      <body><Script src="/shared/error-notices.js" strategy="beforeInteractive" /><Script src="/shared/site-dialog.js" strategy="beforeInteractive" /><ClientLoggerBoot /><DeploymentRecovery /><PwaLifecycle /><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
