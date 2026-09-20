'use client';

import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export default function PwaInstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = isStandalone();
    const iosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    queueMicrotask(() => {
      setInstalled(standalone);
      setIos(iosDevice);
    });

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setInstalled(false);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setShowIosHelp(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || (!prompt && !ios)) return null;

  const install = async () => {
    if (!prompt) {
      setShowIosHelp(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  };

  return (
    <>
      <button type="button" onClick={() => void install()} className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--brand)] transition-colors hover:bg-[#e8f0fe] dark:hover:bg-[#174ea6]/35 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3" title="安装 JackYun 应用" aria-label="安装 JackYun 应用">
        <span className="material-icons-round text-lg">install_mobile</span>
        <span className="hidden sm:inline">安装应用</span>
      </button>
      {showIosHelp && (
        <div className="fixed inset-0 z-[110] grid place-items-end bg-black/45 p-3 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="pwa-ios-title" onClick={() => setShowIosHelp(false)}>
          <section className="w-full max-w-md rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-4">
              <span className="material-icons-round grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e8f0fe] text-[#1a73e8] dark:bg-[#174ea6]/40 dark:text-[#aecbfa]">ios_share</span>
              <div>
                <h2 id="pwa-ios-title" className="text-lg font-semibold text-[var(--foreground)]">添加到主屏幕</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">在 Safari 底部工具栏点击“分享”，然后选择“添加到主屏幕”。安装后 JackYun 会以独立应用窗口打开。</p>
              </div>
            </div>
            <button type="button" onClick={() => setShowIosHelp(false)} className="mt-5 w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white dark:text-[#202124]">知道了</button>
          </section>
        </div>
      )}
    </>
  );
}
