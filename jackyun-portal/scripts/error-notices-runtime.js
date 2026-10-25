/* Shared browser runtime, bundled with the catalog for React and standalone HTML pages. */
(function () {
  'use strict';
  if(window.JackyunErrors)return;
  const catalog=window.JackyunErrorCatalog,resolve=window.JackyunResolveErrorCode;
  let host,shadow,logProvider,expiryTimer,activityEpoch=0;
  const notices=[],recent=[];
  const NOTICE_DURATION=8000;
  const MUTE_DURATION=30*60*1000;
  // Debug-prefixed UI preferences never enter workspace cloud synchronization.
  const MUTE_PREFIX='jackyun_debug_error_notice_muted:v1:';
  const muted=new Map();
  function isMuted(code,now){
    let until=muted.get(code)||0;
    try{const saved=Number(localStorage.getItem(MUTE_PREFIX+code));if(Number.isFinite(saved))until=Math.max(until,saved);}catch{/* Memory-only fallback when storage is blocked. */}
    if(until>now && until<=now+MUTE_DURATION){muted.set(code,until);return true;}
    muted.delete(code);return false;
  }
  function dismissType(code){
    const until=Date.now()+MUTE_DURATION;muted.set(code,until);
    try{localStorage.setItem(MUTE_PREFIX+code,String(until));}catch{/* Closing still works with blocked storage. */}
    for(let i=notices.length-1;i>=0;i--)if(notices[i].code===code)notices.splice(i,1);
    render();
  }
  window.addEventListener('storage',event=>{
    if(!event.key?.startsWith(MUTE_PREFIX))return;
    const code=event.key.slice(MUTE_PREFIX.length);if(!Object.hasOwn(catalog,code))return;
    muted.delete(code);
    if(isMuted(code,Date.now())){for(let i=notices.length-1;i>=0;i--)if(notices[i].code===code)notices.splice(i,1);render();}
  });
  function foreground(){return document.visibilityState!=='hidden' && (typeof document.hasFocus!=='function'||document.hasFocus());}
  function clearNotices(){activityEpoch++;notices.length=0;clearTimeout(expiryTimer);expiryTimer=undefined;shadow?.replaceChildren();}
  function expire(){const now=Date.now();for(let i=notices.length-1;i>=0;i--)if(notices[i].expiresAt<=now)notices.splice(i,1);}
  function clean(value,depth=0){
    if(depth>6)return '[truncated]';
    if(value instanceof Error)return clean({name:value.name,message:value.message,stack:value.stack},depth+1);
    if(typeof value==='string')return value.slice(0,12000).replace(/Bearer\s+[\w.~-]+/gi,'Bearer [redacted]').replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g,'[redacted token]').replace(/\bsk-[\w-]+/g,'[redacted key]').replace(/((?:password|token|secret|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi,'$1[redacted]').replace(/https?:\/\/[^\s"<>]+/g,url=>{try{const parsed=new URL(url);return parsed.origin+parsed.pathname;}catch{return '[url]';}});
    if(Array.isArray(value))return value.slice(-80).map(item=>clean(item,depth+1));
    if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,50).map(([key,item])=>[key,/authorization|cookie|token|secret|password|credential|session|api[-_]?key|reasoning|analysis/i.test(key)?'[redacted]':clean(item,depth+1)]));
    return value;
  }
  function path(url){try{return new URL(url,location.href).origin+new URL(url,location.href).pathname;}catch{return '';}}
  function isCancelled(input){return input?.name==='AbortError'||input?.error?.name==='AbortError'||input?.cancelled===true;}
  function handledTimerConflict(response,url,body){
    const target=new URL(url,location.href);
    return response.status===409 && target.origin===location.origin && target.pathname==='/api/practice-timer/live'
      && body?.handled===true && ['ACTIVE_SESSION','STALE_REVISION','LOST_CONTROL'].includes(body?.conflict);
  }
  async function responseError(response){
    const reader=response.clone().body?.getReader();if(!reader)return null;
    const chunks=[];let size=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16000){void reader.cancel().catch(()=>{});return null;}chunks.push(value);}}
    finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    try{return JSON.parse(new TextDecoder().decode(bytes));}catch{return null;}
  }
  function report(input){
    if(!input || isCancelled(input))return;
    if(parent!==window){try{if(parent.JackyunErrors && parent.document.fullscreenElement?.tagName!=='IFRAME'){parent.JackyunErrors.report({...input,source:path(location.href)});return;}}catch{/* Cross-origin frames report locally. */}}
    const code=resolve(input),now=Date.now(),source=path(input.url||input.source||location.href);
    const fingerprint=code+'|'+source;
    const existing=notices.find(item=>item.fingerprint===fingerprint && item.expiresAt>now);
    const detail=clean({...input,apiCode:input.apiCode||input.code,code,source,timestamp:new Date(now).toISOString()});
    recent.push(detail);if(recent.length>80)recent.shift();
    // Background errors remain in diagnostics, but never queue a later popup.
    if(!foreground()){clearNotices();return;}
    if(input.silent===true || isMuted(code,now))return;
    expire();
    if(existing && notices.includes(existing)){existing.count++;existing.lastAt=now;existing.detail=detail;}else{
      notices.push({id:crypto.randomUUID(),fingerprint,code,detail,count:1,lastAt:now,expiresAt:now+NOTICE_DURATION});
      if(notices.length>3)notices.shift();
    }
    render();
  }
  function snapshot(notice){
    let logs;
    try{logs=logProvider?.();}catch{/* The toast remains usable when logger storage fails. */}
    return JSON.stringify(clean({error:notice.detail,occurrences:notice.count,diagnostics:logs,events:recent}),null,2).slice(0,100000);
  }
  function ensureHost(){
    if(!document.body)return false;
    if(!host){host=document.createElement('div');host.dataset.jackyunErrors='';shadow=host.attachShadow({mode:'open'});}
    const target=document.fullscreenElement||document.body;
    if(host.parentElement!==target)target.appendChild(host);
    return true;
  }
  function render(){
    if(!foreground()){clearNotices();return;}
    expire();clearTimeout(expiryTimer);expiryTimer=undefined;
    if(notices.length)expiryTimer=setTimeout(render,Math.max(0,Math.min(...notices.map(notice=>notice.expiresAt))-Date.now()));
    if(!ensureHost())return;
    shadow.replaceChildren();
    const style=document.createElement('style');
    style.textContent=':host{position:fixed;top:max(4.5rem,calc(4rem + env(safe-area-inset-top)));right:max(12px,env(safe-area-inset-right));z-index:89;width:min(420px,calc(100vw - 24px));font:12px/1.4 system-ui,"Microsoft YaHei",sans-serif;color:var(--foreground,#182230);pointer-events:none}.stack{display:block}.notice{position:relative;display:flex;align-items:center;gap:6px;box-sizing:border-box;min-height:40px;padding:4px 6px 4px 12px;border:1px solid #d0d5dd;border-radius:10px;background:var(--card,#fff);box-shadow:0 3px 12px #10182812;pointer-events:none}.message{min-width:0;flex:1;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:400}.code{font:11px/1.5 ui-monospace,monospace;margin:0 0 8px;color:var(--muted-foreground,#667085)}.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}button,a,textarea,summary{pointer-events:auto}button,a,summary{font:inherit}button,summary{cursor:pointer;min-height:32px;min-width:32px;padding:4px 6px;box-sizing:border-box;border-radius:6px;border:0;background:transparent;color:inherit}.close{font-size:18px;order:3}summary{list-style:none;color:var(--muted-foreground,#667085);display:flex;align-items:center}summary::-webkit-details-marker{display:none}.panel{position:absolute;right:0;top:calc(100% + 6px);box-sizing:border-box;width:min(420px,calc(100vw - 24px));padding:12px;border:1px solid #d0d5dd;border-radius:10px;background:var(--card,#fff);box-shadow:0 4px 16px #10182818;pointer-events:auto}.full-message{margin:0 0 8px;white-space:normal;overflow-wrap:anywhere}a{color:#155eef}textarea{box-sizing:border-box;width:100%;height:110px;margin-top:8px;font:11px/1.4 monospace;border-radius:6px}button:focus-visible,a:focus-visible,summary:focus-visible,textarea:focus-visible{outline:2px solid #155eef;outline-offset:2px}';
    shadow.appendChild(style);const stack=document.createElement('section');stack.className='stack';stack.setAttribute('aria-label','错误提示');shadow.appendChild(stack);
    for(const notice of notices.slice(-1)){
      const card=document.createElement('article');card.className='notice';card.dataset.code=notice.code;card.setAttribute('role','alert');
      const message=document.createElement('p');message.className='message';message.textContent=catalog[notice.code].message;message.title=catalog[notice.code].message;card.appendChild(message);
      const details=document.createElement('details');details.open=Boolean(notice.expanded);details.ontoggle=()=>{notice.expanded=details.open;};const summary=document.createElement('summary');summary.textContent='详情';details.appendChild(summary);const panel=document.createElement('div');panel.className='panel';details.appendChild(panel);card.appendChild(details);
      const full=document.createElement('p');full.className='full-message';full.textContent=catalog[notice.code].message;panel.appendChild(full);
      const code=document.createElement('p');code.className='code';code.textContent=notice.code+(notice.count>1?' · 重复 '+notice.count+' 次':'');panel.appendChild(code);
      const close=document.createElement('button');close.className='close';close.type='button';close.textContent='×';close.setAttribute('aria-label','关闭错误提示');close.title='关闭后相同类型的错误 30 分钟内不再弹出';close.onclick=()=>dismissType(notice.code);card.appendChild(close);
      const actions=document.createElement('div');actions.className='actions';panel.appendChild(actions);
      const copy=document.createElement('button');copy.type='button';copy.textContent='复制日志';copy.onclick=async()=>{
        const text=snapshot(notice);
        try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(text);copy.textContent='已复制';}
        catch{copy.textContent='请手动复制';let area=card.querySelector('textarea');if(!area){area=document.createElement('textarea');area.readOnly=true;area.setAttribute('aria-label','可复制的错误日志');panel.appendChild(area);}area.value=text;area.focus();area.select();}
      };actions.appendChild(copy);
      const docs=document.createElement('a');docs.href='/docs/errors.html#'+notice.code;docs.target='_blank';docs.rel='noopener';docs.textContent='错误码说明';actions.appendChild(docs);stack.appendChild(card);
    }
  }
  window.JackyunErrors={report,setLogProvider(provider){logProvider=provider;},getNotices(){return clean(notices);}};
  window.addEventListener('jackyun:diagnostic',event=>{const detail=event.detail;if(detail?.level==='error')report({tag:detail.tag,message:detail.message,...detail.data});});
  window.addEventListener('jackyun:error-notice',event=>report(event.detail));
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin || event.data?.type!=='jackyun:error-notice')return;
    if(![...document.querySelectorAll('iframe')].some(frame=>frame.contentWindow===event.source))return;
    report(event.data.error);
  });
  window.addEventListener('error',event=>{
    if(event instanceof ErrorEvent)report({tag:'GlobalError',message:event.message,error:event.error});
    else report({code:'RESOURCE_LOAD_FAILED',tag:'ResourceError',url:event.target?.src||event.target?.href});
  },true);
  window.addEventListener('unhandledrejection',event=>report({tag:'UnhandledRejection',message:event.reason?.message||String(event.reason),error:event.reason}));
  const consoleError=console.error.bind(console);
  console.error=(...args)=>{consoleError(...args);const data=args.find(item=>item && typeof item==='object' && !(item instanceof Error));const error=args.find(item=>item instanceof Error);report({...data,tag:String(args[0]||'Console'),message:args.filter(item=>typeof item==='string').join(' '),error});};
  const fetch=window.fetch.bind(window);
  window.fetch=async(...args)=>{
    const url=typeof args[0]==='string'?args[0]:args[0] instanceof URL?args[0].href:args[0].url;
    try{
      const response=await fetch(...args);
      if(!response.ok || response.headers.get('content-type')?.includes('application/json')){
        const responseEpoch=activityEpoch;
        const basic={tag:url.includes('/sync/')?'Sync':'Network',url,status:response.status,requestId:response.headers.get('x-request-id')||undefined,silent:!foreground()};
        if(response.headers.get('content-type')?.includes('json')){
          void responseError(response).then(body=>{if(!response.ok||body?.ok===false||body?.success===false)report({...basic,silent:basic.silent||responseEpoch!==activityEpoch||handledTimerConflict(response,url,body),conflict:body?.conflict,code:body?.error?.siteCode||body?.siteCode||body?.error?.code||body?.code,apiCode:body?.error?.code||body?.code,message:typeof body?.error==='string'?body.error:body?.error?.message||body?.message,requestId:body?.requestId||basic.requestId});}).catch(()=>{if(!response.ok)report({...basic,silent:basic.silent||responseEpoch!==activityEpoch});});
        }else if(!response.ok)report(basic);
      }
      return response;
    }catch(error){if(error?.name!=='AbortError')report({tag:'Network',url,message:error?.message,error});throw error;}
  };
  const xhrOpen=XMLHttpRequest.prototype.open,xhrSend=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(...args){this.__jyErrorUrl=String(args[1]);return xhrOpen.apply(this,args);};
  XMLHttpRequest.prototype.send=function(...args){this.__jyCancelled=false;this.addEventListener('abort',()=>{this.__jyCancelled=true;},{once:true});this.addEventListener('loadend',()=>{if(!this.__jyCancelled && (this.status>=400 || this.status===0)){let body;try{body=this.responseType==='json'?this.response:JSON.parse(this.responseText);}catch{/* Non-JSON errors use HTTP classification. */}report({tag:'XHR',url:this.__jyErrorUrl,status:this.status,code:body?.error?.code||body?.code,requestId:body?.requestId});}},{once:true});this.addEventListener('timeout',()=>{this.__jyCancelled=true;report({code:'TIMEOUT',url:this.__jyErrorUrl});},{once:true});return xhrSend.apply(this,args);};
  document.addEventListener('DOMContentLoaded',render,{once:true});
  document.addEventListener('fullscreenchange',render);
  document.addEventListener('visibilitychange',()=>{if(!foreground())clearNotices();});
  window.addEventListener('blur',clearNotices);
})();
