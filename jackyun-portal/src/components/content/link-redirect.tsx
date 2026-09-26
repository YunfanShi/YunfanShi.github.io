"use client";
import { useEffect, useState } from "react";
export default function LinkRedirect({
  name,
  url,
}: {
  name: string;
  url: string;
}) {
  const [seconds, setSeconds] = useState(3);
  useEffect(() => {
    const timer = window.setInterval(
      () => setSeconds((s) => Math.max(0, s - 1)),
      1000,
    );
    const redirect = window.setTimeout(
      () => window.location.replace(url),
      3000,
    );
    return () => {
      clearInterval(timer);
      clearTimeout(redirect);
    };
  }, [url]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#101012] px-6 text-zinc-100">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl sm:p-12">
        <p className="text-sm font-semibold tracking-widest text-zinc-400">
          JackYun Platform
        </p>
        <div className="my-8 h-1 w-16 rounded bg-white" />
        <h1 className="text-3xl font-semibold leading-tight">
          正在跳转到 {name}
        </h1>
        <p className="mt-5 break-all text-sm leading-6 text-zinc-400">{url}</p>
        <p role="status" className="mt-8 text-sm text-zinc-400">
          {seconds} 秒后自动跳转
        </p>
        <a
          href={url}
          rel="noreferrer"
          className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 font-medium text-black hover:bg-zinc-200"
        >
          立即前往 ↗
        </a>
        <p className="mt-8 text-xs text-zinc-500">
          即将离开 JackYun，前往上方显示的网站。
        </p>
      </section>
    </main>
  );
}
