'use client';

import { createPortal } from 'react-dom';
import { useState, type CSSProperties } from 'react';
import { CUE_SHOP_ITEMS, cueShopBalance, cueEquippedItems, cueEquipLimit, type CueGameAccount, type CueShopAction, type CueShopCategory, type CueShopItem } from '@/lib/learning/cue-shop';
import CloudPreferencesPanel from '@/components/settings/cloud-preferences-panel';
import { useCueReducedMotion, useCueStudyPreferences } from './use-cue-study-preferences';
import CuePracticeBurst from './cue-practice-burst';
import CueUniverseBackdrop from './cue-universe-backdrop';
import styles from './cue-star-shop.module.css';
import gameStyles from './cue-game-panel.module.css';

const categories: Record<CueShopCategory,string> = {effect:'粒子特效',theme:'星空主题',title:'称号',frame:'侧栏装饰',credit:'积分兑换'};
export default function CueStarShop({account,onAction,onClose,animations:requestedAnimations}: {account:CueGameAccount;onAction:(action:CueShopAction)=>void;onClose:()=>void;animations:boolean}) {
  const reducedMotion = useCueReducedMotion();
  const preferences = useCueStudyPreferences();
  const animations = requestedAnimations && !reducedMotion;
  const [category,setCategory] = useState<CueShopCategory | 'all'>('all');
  const [view,setView] = useState<'catalog'|'owned'|'history'>('catalog');
  const [preview,setPreview] = useState<CueShopItem>();
  const [limit,setLimit] = useState(40);
  const [message,setMessage] = useState('');
  const balance=cueShopBalance(account);
  const owned=new Set(account.purchases.map(item=>item.itemId));
  const loadout = (Object.keys(categories) as CueShopCategory[]).filter(category => category !== 'credit').map(category => ({ category, items: cueEquippedItems(account, category) }));
  const transactions=[...account.earnings.map(entry=>({...entry,type:'earn',name:entry.label})),...account.purchases.map(entry=>({...entry,type:'spend',name:CUE_SHOP_ITEMS.find(item=>item.id===entry.itemId)?.name ?? entry.itemId}))].toSorted((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));
  const dismissPreview=()=>setPreview(undefined);
  if (typeof document === 'undefined') return null;
  return createPortal(<div className={styles.overlay} role="dialog" aria-modal="true" aria-label="星空商店" onKeyDown={event=>{
    event.stopPropagation();
    if(event.key==='Escape') { event.preventDefault(); if(preview) dismissPreview(); else onClose(); }
    if(event.key==='Tab') {const root=preview?event.currentTarget.querySelector('[data-shop-preview]'):event.currentTarget;const controls=[...(root?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, a[href]') ?? [])];if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}}
  }}>
    <header><div><small>THE STAR EXCHANGE</small><h2>星空商店</h2></div><button type="button" autoFocus onClick={onClose}>返回学习</button></header>
    <div className={styles.wallet}><div><small>站内星空积分</small><strong>✦ {balance.stars}</strong></div><div><small>可用 XP</small><strong>{balance.xp}</strong></div><div><small>累计经验等级</small><strong>Lv.{balance.level}</strong></div><div><small>永久收藏</small><strong>{owned.size} / {CUE_SHOP_ITEMS.length}</strong></div></div>
    <p className={styles.note}>每次认真检索获得 1 点；连续通过、完成阶段与薄弱项重练另有奖励。兑换 XP 不降低等级。旧记录已计入，兑换与装备随学习数据同步；站内积分是学习游戏积分，不兑换现金、会员或 AI 额度。</p>
    <nav aria-label="商店视图">{([['catalog','浏览商品'],['owned','我的收藏'],['history','交易记录']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={view===value} onClick={()=>setView(value)}>{label}</button>)}</nav>
    {view!=='history'&&<nav aria-label="商品分类"><button type="button" aria-pressed={category==='all'} onClick={()=>setCategory('all')}>全部商品</button>{Object.entries(categories).map(([value,label])=><button type="button" key={value} aria-pressed={category===value} onClick={()=>setCategory(value as CueShopCategory)}>{label}</button>)}{category!=='all'&&category!=='credit'&&<button type="button" onClick={()=>{onAction({kind:'reset',category});setMessage('已恢复默认');}}>恢复此类默认</button>}</nav>}
    <p role="status" className={styles.note}>{message}</p>
    <div className={styles.content}>    <details className={styles.motionSettings}><summary>动效设置 · 背景{preferences.cueAmbientMotion?'开启':'关闭'} · 粒子{preferences.cueCelebrationMotion?'开启':'关闭'}</summary>{reducedMotion && <p>系统减少动态效果已启用；保留静态主题、称号和装饰。</p>}<CloudPreferencesPanel sectionKey="learning_preferences" initialValue={{...preferences}} fields={[{key:'cueItemMotion',label:'学习反馈动效',description:'开启后可播放已装配的评价与粒子反馈。',type:'boolean'},{key:'cueAmbientMotion',label:'星空背景动画',description:'关闭时保留已装配主题的静态星空。',type:'boolean'},{key:'cueCelebrationMotion',label:'装配粒子特效',description:'每四次认真检索触发，已装配的多种特效轮换播放。',type:'boolean'}]} /></details>
    <section className={styles.loadout} aria-label="当前装配"><h3>当前装配</h3><p>主题 1 个；称号、侧栏装饰、特效各最多 3 个。特效轮换播放，装饰分层展示。隐藏侧栏保留星空主题。</p>{loadout.map(({category,items}) => <div key={category}><strong>{categories[category]} · {items.length}/{cueEquipLimit(category)}</strong>{items.length ? items.map(item => <button type="button" key={item.id} aria-label={`卸下 ${item.name}`} onClick={() => { onAction({kind:'unequip',itemId:item.id}); setMessage(`已卸下 ${item.name}`); }}>{item.name} ×</button>) : <span>使用默认</span>}</div>)}</section>
{view==='history'?<><ol className={styles.history}>{transactions.slice(0,limit).map(entry=><li key={entry.id}><span><strong>{entry.name}</strong><small>{new Date(entry.at).toLocaleString('zh-CN')}</small></span><b>{entry.stars?`${entry.type==='earn'?'+':'−'}${entry.stars} ✦`:''}{entry.xp?` ${entry.type==='earn'?'+':'−'}${entry.xp} XP`:''}</b></li>)}</ol>{transactions.length>limit&&<button type="button" onClick={()=>setLimit(value=>value+40)}>加载更多记录</button>}{!transactions.length&&<p>完成第一条 CUE 后会留下记录。</p>}</>:<div className={styles.grid}>{CUE_SHOP_ITEMS.filter(item=>(category==='all'||item.category===category)&&(view!=='owned'||owned.has(item.id))).map(item=>{
      const purchased=owned.has(item.id), selected=cueEquippedItems(account,item.category), equipped=selected.some(entry=>entry.id===item.id);
      const canEquip=item.category!=='credit'&&(item.category==='theme'||selected.length<cueEquipLimit(item.category));
      const locked=balance.level<item.level,affordable=balance.stars>=item.stars&&balance.xp>=item.xp;
      return <article key={item.id} data-category={item.category} data-equipped={equipped}><div className={styles.art} data-style={item.value}><span>{item.category==='effect'?'✧':item.category==='theme'?'✦':item.category==='frame'?'◎':'◇'}</span><i/><i/><i/></div><div className={styles.item}><small>{categories[item.category]} · Lv.{item.level}</small><h3>{item.name}</h3><p>{item.description}</p><strong>{item.stars?`${item.stars} 星空积分`:`${item.xp} XP`}{item.category==='credit'&&` → +${item.value} 积分`}</strong><div>{item.category!=='credit'&&<button type="button" aria-label={`预览 ${item.name}`} onClick={()=>setPreview(item)}>预览</button>}<button type="button" disabled={(item.category==='credit'&&purchased)||(purchased&&!equipped&&item.category!=='credit'&&!canEquip)||(!purchased&&(locked||!affordable))} onClick={()=>{
        const kind=equipped?'unequip':purchased?'equip':canEquip?'purchase-equip':'purchase';
        onAction({kind,itemId:item.id});
        setMessage(equipped?`已卸下 ${item.name}`:item.category==='credit'?`已兑换 ${item.value} 星空积分`:purchased||canEquip?`已装备 ${item.name}`:`已兑换 ${item.name}，装配位已满，可在“当前装配”卸下其他道具后装备`);
      }}>{item.category==='credit'&&purchased?'已领取':equipped?'卸下':purchased?canEquip?'装备':'装配位已满':locked?`Lv.${item.level} 解锁`:!affordable?'余额不足':item.category==='credit'?'兑换积分':canEquip?'兑换并装备':'兑换到收藏'}</button></div></div></article>;
    })}{view==='owned'&&!CUE_SHOP_ITEMS.some(item=>(category==='all'||item.category===category)&&owned.has(item.id))&&<p>这个分类还没有收藏，可以先预览再兑换。</p>}</div>}</div>
    {preview&&<div data-shop-preview role="dialog" aria-modal="true" className={styles.preview} aria-label={`${preview.name}预览`}><div className={styles.previewSurface}>{preview.category==='effect'?animations?<CuePracticeBurst key={preview.id} variant={Number(preview.value)} status="stable" count={account.earnings.filter(entry=>!entry.extra).length}/>:<p>学习动效已关闭，开启后可播放粒子效果。</p>:<><CueUniverseBackdrop stars={[]} animations={animations} theme={preview.category==='theme'?String(preview.value):undefined}/>{(preview.category==='title'||preview.category==='frame')&&<div className={styles.previewCard}>{preview.category==='frame'&&<span className={gameStyles.frameLayers}><i data-cue-frame={preview.value} style={{'--frame-inset':'4px'} as CSSProperties}/></span>}<small>装配效果预览</small><strong>{preview.name}</strong><span>{preview.category==='title'?'与其他称号同时展示':'与其他侧栏装饰分层展示'}</span></div>}</>}</div><button type="button" autoFocus onClick={dismissPreview}>关闭预览 · {preview.name}</button></div>}
  </div>, document.body);
}
