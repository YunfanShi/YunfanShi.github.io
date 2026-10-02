'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CueStar } from '@/lib/learning/cue-game';
import CueUniverseBackdrop from './cue-universe-backdrop';

export default function CueSkyViewer({stars,day,animations,theme,onClose}:{stars:CueStar[];day:string;animations:boolean;theme?:string;onClose:()=>void}) {
  const surface=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const before=document.activeElement;
    let ownsFullscreen=false,disposed=false;
    const close=()=>{if(ownsFullscreen&&document.fullscreenElement===surface.current) void document.exitFullscreen().catch(()=>{});onClose();};
    const key=(event:KeyboardEvent)=>{event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)close();};
    const change=()=>{if(ownsFullscreen&&!document.fullscreenElement)onClose();};
    const element=surface.current;element?.focus();
    if(element&&!document.fullscreenElement&&element.requestFullscreen) void element.requestFullscreen().then(()=>{ownsFullscreen=true;if(disposed&&document.fullscreenElement===element)void document.exitFullscreen().catch(()=>{});}).catch(()=>{});
    window.addEventListener('keydown',key,true);document.addEventListener('fullscreenchange',change);
    return()=>{disposed=true;window.removeEventListener('keydown',key,true);document.removeEventListener('fullscreenchange',change);if(ownsFullscreen&&document.fullscreenElement===element)void document.exitFullscreen().catch(()=>{});if(before instanceof HTMLElement)queueMicrotask(()=>before.focus());};
  },[onClose]);
  return createPortal(<div data-cue-sky-viewer ref={surface} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${day} 星空，按任意键返回`} onClick={onClose} style={{position:'fixed',inset:0,zIndex:500,background:'#040810',isolation:'isolate',outline:'none'}}><style>{'body > :not([data-cue-sky-viewer]) { display: none !important; }'}</style><CueUniverseBackdrop stars={stars} animations={animations} theme={theme}/></div>,document.body);
}
