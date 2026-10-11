(function () {
  'use strict';
  if (window.JackyunDialog) return;
  let tail = Promise.resolve();
  const api = {};
  function open(kind, message, options = {}) {
    try {
      if (parent !== window && parent.JackyunDialog && parent.document.fullscreenElement?.tagName !== 'IFRAME') return parent.JackyunDialog[kind](message, options);
    } catch { /* Standalone or sandboxed page: render locally. */ }
    const result = tail.then(() => new Promise(resolve => {
      const previous = document.activeElement;
      const host = document.createElement('div'); host.dataset.jackyunDialog = kind;
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `<style>:host{color-scheme:light dark}dialog{box-sizing:border-box;width:min(92vw,480px);max-height:85dvh;overflow:auto;border:1px solid #8795ac44;border-radius:24px;padding:26px;background:var(--card,#fff);color:var(--foreground,#182230);font:15px/1.65 system-ui,'Microsoft YaHei',sans-serif;box-shadow:0 24px 90px #0005}dialog::backdrop{background:#10182888;backdrop-filter:blur(5px)}h2{font-size:19px;margin:0 0 12px}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 22px}footer{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}button,input{font:inherit}button{min-height:44px;border-radius:12px;padding:8px 18px;cursor:pointer;border:1px solid #8795ac55;background:var(--background,#f3f5f9);color:inherit}button[data-primary]{background:#155eef;color:white;border:0}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #8795ac88;border-radius:12px;margin:0 0 20px;background:var(--background,#f3f5f9);color:inherit} @media(prefers-color-scheme:dark){dialog{background:var(--card,#182230);color:var(--foreground,#f5f6fa)}button,input{background:var(--background,#263247)}}</style><dialog aria-labelledby="title" aria-describedby="message"><h2 id="title"></h2><p id="message"></p><footer></footer></dialog>`;
      const dialog = shadow.querySelector('dialog');
      shadow.querySelector('h2').textContent = options.title || (kind === 'confirm' ? '请确认' : kind === 'prompt' ? '填写内容' : '站内提醒');
      shadow.querySelector('p').textContent = String(message ?? '');
      let input;
      if (kind === 'prompt') { input = document.createElement('input'); input.value = options.defaultValue || ''; input.setAttribute('aria-label',options.inputLabel || '填写内容'); dialog.insertBefore(input,shadow.querySelector('footer')); }
      let settled = false;
      function finish(accepted) { if(settled)return;settled=true;dialog.close();host.remove();if(previous?.isConnected)previous.focus?.({preventScroll:true});resolve(kind==='confirm'?accepted:kind==='prompt'?(accepted?input.value:null):undefined); }
      function button(label, accepted) { const el=document.createElement('button');el.type='button';el.textContent=label;if(accepted)el.dataset.primary='';el.addEventListener('click',()=>finish(accepted));shadow.querySelector('footer').appendChild(el);return el; }
      const cancel = kind !== 'alert' ? button(options.cancelLabel || '取消',false) : null;
      const accept = button(options.confirmLabel || (kind === 'confirm' ? '确认继续' : kind === 'prompt' ? '保存' : '知道了'),true);
      dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();finish(false)});
      host.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Enter'&&shadow.activeElement===input){event.preventDefault();finish(true)}});
      host.addEventListener('keyup',event=>event.stopPropagation());
      (document.fullscreenElement || document.body).appendChild(host);
      dialog.showModal(); (input || cancel || accept).focus(); input?.select();
    }));
    tail = result.catch(()=>{}); return result;
  }
  for (const kind of ['alert','confirm','prompt']) api[kind]=(message,options)=>open(kind,message,typeof options==='string'?{defaultValue:options}:options);
  api.isOpen=()=>Boolean(document.querySelector('[data-jackyun-dialog]'));
  window.JackyunDialog=api;
})();
