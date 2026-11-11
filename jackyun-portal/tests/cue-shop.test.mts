import {scheduleToResources, resourcesToSchedule} from '../src/lib/sync/resource-model.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCueGameAccount, cueShopBalance, purchaseCueShopItem, equipCueShopItem, cueEquippedValue, CUE_SHOP_ITEMS, cueEquippedItems, applyCueShopAction, emptyCueGameAccount, cueEffectVariant } from '../src/lib/learning/cue-shop.ts';
import { shuffleCueIds, type CueReview } from '../src/lib/learning/schedule-control.ts';
import { emptyCuePractice, rateCuePractice, enterCuePractice, finishAutomaticCuePractice, cuePracticeReturnIndex } from '../src/lib/learning/cue-practice.ts';
const now=new Date('2026-10-02T15:00:00Z');
const reviews=(count:number,status:CueReview['status']='stable'):CueReview[]=>Array.from({length:count},(_,i)=>({id:`r${i}`,cueId:`cue${i}`,taskKey:'session',reviewedAt:new Date(now.getTime()-100000+1000*i).toISOString(),status,nextReviewDate:'2026-10-03'}));
test('historical credits accrue once and survive recolor, deletion and JSON reload',()=>{
 const evidence=reviews(30);const account=reconcileCueGameAccount(undefined,evidence,now);const balance=cueShopBalance(account);
 assert.equal(account.earnings.filter(entry=>!entry.extra).length,30);assert.equal(balance.earnedXP,300);assert.equal(balance.earnedStars,59);
 assert.equal(reconcileCueGameAccount(account,[...evidence,...evidence],now),account);
 assert.equal(reconcileCueGameAccount(account,evidence.map(entry=>({...entry,status:'unclear'})),now),account);
 assert.equal(reconcileCueGameAccount(account,[],now),account);
 assert.deepEqual(reconcileCueGameAccount(JSON.parse(JSON.stringify(account)),evidence,now),account);
});
test('real retries earn points; recovering a weak item earns EXTRA, not duplicated XP',()=>{
 let evidence=reviews(1,'unclear');let account=reconcileCueGameAccount(undefined,evidence,now);
 evidence=[{...evidence[0],practiceAttempts:[{status:'partial',reviewedAt:'2026-10-02T14:59:10Z'},{status:'stable',reviewedAt:'2026-10-02T14:59:30Z'}]}];
 account=reconcileCueGameAccount(account,evidence,now);const balance=cueShopBalance(account);
 assert.equal(account.earnings.filter(entry=>!entry.extra).length,3);assert.equal(balance.earnedStars,5);assert.equal(balance.earnedXP,10);
 assert.equal(account.earnings.filter(entry=>entry.extra)[0].label,'薄弱项重练通过');assert.equal(reconcileCueGameAccount(account,evidence,now),account);
});
test('three colors reward effort; future and practice-only records cannot create phantom points',()=>{
 for(const status of ['stable','partial','unclear'] as const)assert.equal(cueShopBalance(reconcileCueGameAccount(undefined,reviews(1,status),now)).stars,1);
 const base=reviews(1)[0];assert.equal(cueShopBalance(reconcileCueGameAccount(undefined,[{...base,practiceOnly:true},{...base,reviewedAt:'bad'},{...base,reviewedAt:'2030-01-01'}],now)).stars,0);
});
test('exchange enforces level, balances, ownership and spending does not remove lifetime levels',()=>{
 const small=reconcileCueGameAccount(undefined,reviews(1),now);assert.match(purchaseCueShopItem(small,'effect-solar',now).error!,/Lv/);assert.match(purchaseCueShopItem(small,'theme-ice',now).error!,/余额/);
 let account=reconcileCueGameAccount(undefined,reviews(80),now);const initial=cueShopBalance(account);
 account=purchaseCueShopItem(account,'title-explorer',now).account;assert.equal(cueShopBalance(account).xp,initial.xp-80);assert.equal(cueShopBalance(account).level,initial.level);
 assert.equal(purchaseCueShopItem(account,'title-explorer',now).account,account);assert.equal(equipCueShopItem(account,'effect-solar'),account);
 account=equipCueShopItem(account,'title-explorer');assert.equal(cueEquippedValue(account,'title'),'星际探索者');
 const bought=purchaseCueShopItem(account,'effect-solar',now).account;assert.equal(cueShopBalance(bought).stars,initial.stars-18);assert.equal(bought.purchases.length,2);
 assert.ok(CUE_SHOP_ITEMS.length >= 29);assert.ok(CUE_SHOP_ITEMS.some(item=>item.category==='effect'&&item.xp>0));assert.ok(CUE_SHOP_ITEMS.some(item=>item.stars>0&&item.stars<10));assert.ok(CUE_SHOP_ITEMS.some(item=>item.stars>=200));
});
test('shuffle interleaves balanced subjects and rotates units while preserving all identities',()=>{
 const cues=Array.from({length:24},(_,i)=>({id:String(i),subjectName:`S${Math.floor(i/8)}`,unit:`U${Math.floor((i%8)/4)}`}));const ids=cues.map(cue=>cue.id);
 for(const random of [()=>0,()=>.4,()=>.99]){const order=shuffleCueIds(ids,random,cues);assert.equal(new Set(order).size,24);const byId=new Map(cues.map(cue=>[cue.id,cue]));const last=new Map<string,string>();for(let i=0;i<order.length;i++){const cue=byId.get(order[i])!;if(i)assert.notEqual(cue.subjectName,byId.get(order[i-1])!.subjectName);if(last.has(cue.subjectName))assert.notEqual(cue.unit,last.get(cue.subjectName));last.set(cue.subjectName,cue.unit);}}assert.deepEqual(cues.map(cue=>cue.id),ids);
});
test('skip rotates weak items; automatic pass returns to normal while explicit mode retains its directory',()=>{
 let state=emptyCuePractice();state=rateCuePractice(state,'weak-a','unclear',true,0,()=>0);state=rateCuePractice(state,'weak-b','partial',true,0,()=>0);
 state=enterCuePractice(state,600000,undefined,'normal-next');assert.equal(state.active,'weak-a');state=enterCuePractice(state,600000,state.active,'normal-next');assert.equal(state.active,'weak-b');assert.equal(state.returnCueId,'normal-next');assert.equal(cuePracticeReturnIndex(state,['normal-before','normal-next']),1);
 state=rateCuePractice(state,'weak-b','stable',true,600000);const automatic=finishAutomaticCuePractice(state,'stable');assert.equal(automatic.active,undefined);assert.equal(automatic.pending[0].cueId,'weak-a');assert.equal(automatic.results?.['weak-b'].status,'stable');assert.equal(finishAutomaticCuePractice({...state,mode:true},'stable').active,'weak-b');
});

test('credit packs convert expendable XP once without changing cumulative level', () => {
 const account = reconcileCueGameAccount(undefined, reviews(20), now);
 const before = cueShopBalance(account);
 const pack = purchaseCueShopItem(account, 'credit-small', now);
 assert.equal(pack.error, undefined);
 assert.equal(cueShopBalance(pack.account).stars, before.stars + 12);
 assert.equal(cueShopBalance(pack.account).xp, before.xp - 80);
 assert.equal(cueShopBalance(pack.account).level, before.level);
 assert.equal(purchaseCueShopItem(pack.account, 'credit-small', now).account, pack.account);
 assert.equal(equipCueShopItem(pack.account, 'credit-small'), pack.account);
});


test('legacy equipment and purchases survive multi-slot equip, single removal, reset and JSON reload', () => {
 let account=emptyCueGameAccount();account.earnings=[{id:'funds',at:now.toISOString(),stars:5000,xp:5000,label:'test',sessionKey:'test'}];
 for(const id of ['title-first','title-curious','title-dawn','title-repair','frame-orbit','frame-comet','frame-starlight','effect-solar','effect-warp','effect-helix','theme-ice','theme-emerald'])account=purchaseCueShopItem(account,id,now).account;
 account={...account,equipment:{title:'title-first',theme:'theme-ice'}};
 assert.deepEqual(cueEquippedItems(account,'title').map(item=>item.id),['title-first']);
 for(const id of ['title-curious','title-dawn'])account=equipCueShopItem(account,id);
 assert.equal(cueEquippedItems(account,'title').length,3);
 assert.equal(equipCueShopItem(account,'title-repair'),account,'full category must not silently drop another item');
 for(const id of ['frame-orbit','frame-comet','frame-starlight','effect-solar','effect-warp','effect-helix'])account=equipCueShopItem(account,id);
 account=equipCueShopItem(account,'theme-emerald');
 for(const category of ['title','frame','effect'] as const)assert.equal(cueEquippedItems(account,category).length,3);
 assert.deepEqual(cueEquippedItems(account,'theme').map(item=>item.id),['theme-emerald']);
 const restored=JSON.parse(JSON.stringify(account));assert.deepEqual(cueEquippedItems(restored,'frame'),cueEquippedItems(account,'frame'));
 const balance=cueShopBalance(account);const purchaseCount=account.purchases.length;
 account=applyCueShopAction(account,{kind:'unequip',itemId:'title-first'});
 assert.equal(account.equipment.title,'title-curious');assert.equal(cueEquippedItems(account,'title').length,2);
 account=applyCueShopAction(account,{kind:'reset',category:'frame'});
 assert.equal(cueEquippedItems(account,'frame').length,0);assert.equal(cueEquippedItems(account,'effect').length,3);
 assert.deepEqual(cueShopBalance(account),balance);assert.equal(account.purchases.length,purchaseCount);
 assert.equal(equipCueShopItem(account,'theme-nebula'),account,'unowned item cannot be equipped');
});

test('purchase and equip is atomic and all added cosmetics have unique identities',()=>{
 let account=emptyCueGameAccount();assert.equal(applyCueShopAction(account,{kind:'purchase-equip',itemId:'theme-emerald'}),account);
 account.earnings=[{id:'funds',at:now.toISOString(),stars:1000,xp:2000,label:'test',sessionKey:'test'}];
 account=applyCueShopAction(account,{kind:'purchase-equip',itemId:'theme-emerald'});
 assert.equal(cueEquippedValue(account,'theme'),'emerald');assert.equal(account.purchases.length,1);
 assert.equal(applyCueShopAction(account,{kind:'purchase-equip',itemId:'theme-emerald'}),account);
 assert.equal(new Set(CUE_SHOP_ITEMS.map(item=>item.id)).size,CUE_SHOP_ITEMS.length);
 assert.ok(CUE_SHOP_ITEMS.length>=41);
});


test('two and three equipped effects rotate by celebration count without skipping slots',()=>{
 let account=emptyCueGameAccount();account.earnings=[{id:'funds',at:now.toISOString(),stars:5000,xp:5000,label:'test',sessionKey:'test'}];
 for(const id of ['effect-solar','effect-helix'])account=applyCueShopAction(account,{kind:'purchase-equip',itemId:id});
 assert.deepEqual([4,8,12,16].map(completed=>cueEffectVariant(account,completed)),[3,9,3,9]);
 account=applyCueShopAction(account,{kind:'purchase-equip',itemId:'effect-flower'});
 assert.deepEqual([4,8,12,16].map(completed=>cueEffectVariant(account,completed)),[3,9,10,3]);
});


test('V5 preserves multi-slot loadout together with the original purchase ledger',()=>{
 let account=emptyCueGameAccount();account.earnings=[{id:'funds',at:now.toISOString(),stars:1000,xp:1000,label:'test',sessionKey:'test'}];
 for(const id of ['frame-orbit','frame-comet','title-first','title-dawn'])account=applyCueShopAction(account,{kind:'purchase-equip',itemId:id});
 const restored=resourcesToSchedule(scheduleToResources({schemaVersion:1,cueGameAccount:account}));
 assert.deepEqual(restored.cueGameAccount,account);
});
