'use client';

import { useState } from 'react';
import { CUE_SHOP_ITEMS, cueShopBalance, type CueGameAccount, type CueShopAction, type CueShopCategory, type CueShopItem } from '@/lib/learning/cue-shop';
import CuePracticeBurst from './cue-practice-burst';
import CueUniverseBackdrop from './cue-universe-backdrop';
import styles from './cue-star-shop.module.css';

const categories: Record<CueShopCategory,string> = {effect:'粒子特效',theme:'星空主题',title:'称号',frame:'侧栏装饰'};
export default function CueStarShop({account,onAction,onClose,animations}: {account:CueGameAccount;onAction:(action:CueShopAction)=>void;onClose:()=>void;animations:boolean}) {
  const [category,setCategory] = useState<CueShopCategory>('effect');
  const [view,setView] = useState<'catalog'|'owned'|'history'>('catalog');
  const [preview,setPreview] = useState<CueShopItem>();
  const [limit,setLimit] = useState(40);
  const [message,setMessage] = useState('');
  const balance=cueShopBalance(account);
  const owned=new Set(account.purchases.map(item=>item.itemId));
  const transactions=[...account.earnings.map(entry=>({...entry,type:'earn',name:entry.label})),...account.purchases.map(entry=>({...entry,type:'spend',name:CUE_SHOP_ITEMS.find(item=>item.id===entry.itemId)?.name ?? entry.itemId}))].toSorted((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));
  const dismissPreview=()=>setPreview(undefined);
  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="星空商店" onKeyDown={event=>{
    event.stopPropagation();
    if(event.key==='Escape') { event.preventDefault(); if(preview) dismissPreview(); else onClose(); }
    if(event.key==='Tab') {const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)')];if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}}
  }}>
    <header><div><small>THE STAR EXCHANGE</small><h2>星空商店</h2></div><button type="button" autoFocus onClick={onClose}>返回学习</button></header>
    <div className={styles.wallet}><div><small>星空点余额</small><strong>✦ {balance.stars}</strong></div><div><small>可用 XP</small><strong>{balance.xp}</strong></div><div><small>累计经验等级</small><strong>Lv.{balance.level}</strong></div><div><small>永久收藏</small><strong>{owned.size} / {CUE_SHOP_ITEMS.length}</strong></div></div>
    <p className={styles.note}>每次认真检索获得 1 点；连续通过、完成阶段与薄弱项重练另有奖励。兑换 XP 不降低等级。旧记录已计入，兑换与装备随学习数据保存。</p>
    <nav aria-label="商店视图">{([['catalog','浏览商品'],['owned','我的收藏'],['history','交易记录']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={view===value} onClick={()=>setView(value)}>{label}</button>)}</nav>
    {view!=='history'&&<nav aria-label="商品分类">{Object.entries(categories).map(([value,label])=><button type="button" key={value} aria-pressed={category===value} onClick={()=>setCategory(value as CueShopCategory)}>{label}</button>)}<button type="button" onClick={()=>{onAction({kind:'reset',category});setMessage('已恢复默认');}}>恢复此类默认</button></nav>}
    <p role="status" className={styles.note}>{message}</p>
    <div className={styles.content}>{view==='history'?<><ol className={styles.history}>{transactions.slice(0,limit).map(entry=><li key={entry.id}><span><strong>{entry.name}</strong><small>{new Date(entry.at).toLocaleString('zh-CN')}</small></span><b>{entry.stars?`${entry.type==='earn'?'+':'−'}${entry.stars} ✦`:''}{entry.xp?` ${entry.type==='earn'?'+':'−'}${entry.xp} XP`:''}</b></li>)}</ol>{transactions.length>limit&&<button type="button" onClick={()=>setLimit(value=>value+40)}>加载更多记录</button>}{!transactions.length&&<p>完成第一条 CUE 后会留下记录。</p>}</>:<div className={styles.grid}>{CUE_SHOP_ITEMS.filter(item=>item.category===category&&(view!=='owned'||owned.has(item.id))).map(item=>{
      const purchased=owned.has(item.id),equipped=account.equipment[item.category]===item.id;
      const locked=balance.level<item.level,affordable=balance.stars>=item.stars&&balance.xp>=item.xp;
      return <article key={item.id} data-category={item.category} data-equipped={equipped}><div className={styles.art} data-style={item.value}><span>{item.category==='effect'?'✧':item.category==='theme'?'✦':item.category==='frame'?'◎':'◇'}</span><i/><i/><i/></div><div className={styles.item}><small>{categories[item.category]} · Lv.{item.level}</small><h3>{item.name}</h3><p>{item.description}</p><strong>{item.stars?`${item.stars} 星空点`:`${item.xp} XP`}</strong><div>{(item.category==='effect'||item.category==='theme')&&<button type="button" onClick={()=>setPreview(item)}>预览</button>}<button type="button" disabled={equipped||(!purchased&&(locked||!affordable))} onClick={()=>{onAction({kind:purchased?'equip':'purchase',itemId:item.id});setMessage(purchased?`已装备 ${item.name}`:`已兑换 ${item.name}，在“我的收藏”中装备`);}}>{equipped?'已装备':purchased?'装备':locked?`Lv.${item.level} 解锁`:!affordable?'余额不足':'兑换'}</button></div></div></article>;
    })}{view==='owned'&&!CUE_SHOP_ITEMS.some(item=>item.category===category&&owned.has(item.id))&&<p>这个分类还没有收藏，可以先预览再兑换。</p>}</div>}</div>
    {preview&&<div className={styles.preview} aria-label={`${preview.name}预览`}><div className={styles.previewSurface}>{preview.category==='effect'?animations?<CuePracticeBurst key={preview.id} variant={Number(preview.value)} status="stable" count={account.earnings.filter(entry=>!entry.extra).length}/>:<p>学习动效已关闭，开启后可播放粒子效果。</p>:<CueUniverseBackdrop stars={[]} animations={animations} theme={String(preview.value)}/>}</div><button type="button" autoFocus onClick={dismissPreview}>关闭预览 · {preview.name}</button></div>}
  </div>;
}
