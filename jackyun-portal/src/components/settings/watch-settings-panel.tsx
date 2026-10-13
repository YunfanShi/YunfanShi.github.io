'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';

type Device={id:string;name:string;created_at:string;last_seen_at:string;revoked_at:string|null};
type Pair={id:string;name:string;expiresAt:string;accountLabel:string};
declare global { interface Window { jsQR?: (pixels:Uint8ClampedArray,width:number,height:number)=>{data:string}|null; } }
export default function WatchSettingsPanel({initialPair=''}:{initialPair?:string}) {
  const [input,setInput]=useState(initialPair),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[devices,setDevices]=useState<Device[]>([]),[pair,setPair]=useState<Pair|null>(null),[scanning,setScanning]=useState(false);
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),alive=useRef(true),scanGeneration=useRef(0);
  const stop=useCallback(()=>{scanGeneration.current++;if(timer.current)clearTimeout(timer.current);timer.current=null;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;setScanning(false);},[]);
  async function request(path:string,value?:Record<string,unknown>) {
    const response=await fetch(`/api/watch/v1/${path}`,{method:value?'POST':'GET',headers:value?{'Content-Type':'application/json'}:undefined,body:value?JSON.stringify(value):undefined,cache:'no-store'});
    const result=await response.json().catch(()=>({error:'手表服务暂不可用'}));if(!response.ok)throw Error(result.error??'操作失败');return result;
  }
  const load=useCallback(async()=>{try{const response=await fetch('/api/watch/v1/devices',{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error??'设备读取失败');if(alive.current)setDevices(result.devices??[]);}catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'设备读取失败');}},[]);
  useEffect(()=>{alive.current=true;queueMicrotask(()=>{if(alive.current)void load();});return()=>{alive.current=false;if(timer.current)clearTimeout(timer.current);stream.current?.getTracks().forEach(track=>track.stop());};},[load]);
  async function inspect(raw:string) {
    stop();setBusy(true);setPair(null);
    try {
      let id=raw.trim(),code='';
      if(/^\d{8}$/.test(id)){code=id;id='';}
      else if(id.startsWith('https://')){const url=new URL(id);if(url.origin!=='https://jackyun.top'||url.pathname!=='/settings/watch')throw Error('这不是 JackYun 手表登录二维码');id=url.searchParams.get('pair')??'';}
      if(!code&&!/^[0-9a-f-]{36}$/i.test(id))throw Error('请输入手表上的八位配对码，或扫描登录二维码');
      const result=await request('pair/inspect',{id,code});if(alive.current){setPair(result);setMessage('请核对手表和账号，确认后才授权登录。');}
    }catch(error){setMessage(error instanceof Error?error.message:'配对读取失败');}finally{setBusy(false);}
  }
  async function scan() {
    const generation=++scanGeneration.current;
    setMessage('');setScanning(true);
    try {
      if(!window.jsQR)throw Error('扫描器正在加载，请稍后重试；也可输入配对码');
      const camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if(!alive.current||generation!==scanGeneration.current){camera.getTracks().forEach(track=>track.stop());return;}
      stream.current=camera;
      await new Promise(resolve=>setTimeout(resolve,0));const element=video.current;if(!element)throw Error('扫描器未打开');
      element.srcObject=camera;await element.play();const canvas=document.createElement('canvas');canvas.width=canvas.height=320;
      const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('此浏览器无法读取摄像头，请输入配对码');
      const tick=()=>{if(!alive.current||!stream.current||generation!==scanGeneration.current)return;
        if(element.readyState>=2){const side=Math.min(element.videoWidth,element.videoHeight);if(side>0)context.drawImage(element,(element.videoWidth-side)/2,(element.videoHeight-side)/2,side,side,0,0,320,320);const frame=context.getImageData(0,0,320,320);const result=window.jsQR?.(frame.data,320,320);if(result){setInput(result.data);void inspect(result.data);return;}}
        timer.current=setTimeout(tick,250);
      };tick();
    }catch(error){stop();setMessage(error instanceof Error?error.message:'摄像头不可用，请输入配对码');}
  }
  async function approve() {
    if(!pair)return;setBusy(true);
    try{await request('pair/approve',{id:pair.id});setPair(null);setMessage('已授权，请在手表等待登录完成。');await load();}catch(error){setMessage(error instanceof Error?error.message:'授权失败');}finally{setBusy(false);}
  }
  async function revoke(device:Device) {
    setBusy(true);try{await request('devices/revoke',{id:device.id});setMessage(`${device.name} 的授权已撤销`);await load();}catch(error){setMessage(error instanceof Error?error.message:'撤销失败');}finally{setBusy(false);}
  }
  const button='min-h-11 rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold disabled:opacity-50';
  return <section className="space-y-5">
    <Script src="/vendor/jsqr/jsQR-1.4.0.js" strategy="afterInteractive" />
    <div><h2 className="text-xl font-semibold">手表登录与设备管理</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">手表显示二维码后，在这里扫描并确认使用当前账号登录。电脑也可输入八位配对码。</p></div>
    <div className="flex flex-wrap gap-3"><button className={button} onClick={()=>void scan()} disabled={busy||scanning}>扫描登录二维码</button>{scanning&&<button className={button} onClick={stop}>关闭摄像头</button>}</div>
    {scanning&&<video ref={video} muted playsInline autoPlay aria-label="手表二维码扫描画面" className="aspect-square w-full max-w-sm rounded-xl bg-black object-cover" />}
    <form onSubmit={event=>{event.preventDefault();void inspect(input);}} className="flex flex-wrap gap-3"><label className="min-w-0 flex-1"><span className="mb-1 block text-sm">配对码或登录二维码内容</span><input value={input} onChange={event=>setInput(event.target.value)} className="min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-transparent px-3" autoComplete="off" /></label><button className={`${button} self-end`} disabled={busy}>查看配对请求</button></form>
    {message&&<p role="status" className="text-sm">{message}</p>}
    {pair&&<div className="space-y-3 rounded-xl border border-[var(--card-border)] p-4"><p>手表：<strong>{pair.name}</strong></p><p>登录账号：<strong>{pair.accountLabel}</strong></p><p className="text-sm">有效期至 {new Date(pair.expiresAt).toLocaleTimeString()}。仅在确认这是你的手表后授权。</p><div className="flex flex-wrap gap-3"><button className={`${button} bg-[#1a73e8] text-white`} disabled={busy} onClick={()=>void approve()}>确认登录这块手表</button><button className={button} disabled={busy} onClick={()=>setPair(null)}>暂不授权</button></div></div>}
    <div className="space-y-3"><h3 className="font-semibold">已授权手表</h3>{devices.length===0&&<p className="text-sm text-[var(--muted-foreground)]">尚无可显示的手表；服务读取失败时请查看上方提示。</p>}{devices.map(device=><div key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] p-4"><div><p className="font-medium">{device.name}</p><p className="text-sm text-[var(--muted-foreground)]">{device.revoked_at?'已撤销':`最近使用 ${new Date(device.last_seen_at).toLocaleString()}`}</p></div>{!device.revoked_at&&<button className={button} disabled={busy} onClick={()=>void revoke(device)}>撤销授权</button>}</div>)}</div>
  </section>;
}
