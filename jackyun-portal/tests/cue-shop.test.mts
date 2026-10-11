import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCueGameAccount, cueShopBalance, purchaseCueShopItem, equipCueShopItem, cueEquippedValue, CUE_SHOP_ITEMS } from '../src/lib/learning/cue-shop.ts';
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
