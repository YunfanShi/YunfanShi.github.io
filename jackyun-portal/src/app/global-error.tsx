'use client';
import {useEffect} from 'react';
import Script from 'next/script';

export default function GlobalError({error,reset}:{error:Error & {digest?:string};reset:()=>void}) {
  useEffect(()=>{console.error('[ErrorBoundary] 根页面加载失败',error);},[error]);
  return <html lang="zh-CN"><body style={{fontFamily:'system-ui',padding:32}}>
    <Script src="/shared/error-notices.js" strategy="afterInteractive" onLoad={()=>{
      window.dispatchEvent(new CustomEvent('jackyun:error-notice',{detail:{code:'RENDER_FAILED',message:error.message,digest:error.digest}}));
    }}/>
    <h1>页面暂时无法加载</h1><p>请重试；错误码 JY-4001。右上角错误提示可复制日志。</p>
    <button type="button" onClick={reset}>重新加载</button>
    <p><a href="/docs/errors.html#JY-4001">查看错误码说明</a></p>
  </body></html>;
}
