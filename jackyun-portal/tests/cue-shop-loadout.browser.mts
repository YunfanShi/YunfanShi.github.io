import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createEmptyScheduleState, type StudyCue} from '../src/lib/learning/schedule-control.ts';
import {emptyCueGameAccount, purchaseCueShopItem, equipCueShopItem, cueShopBalance} from '../src/lib/learning/cue-shop.ts';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.JACKYUN_TEST_URL || 'http://localhost:3239';
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/schedule?view=cue');await page.getByRole('region',{name:'CUE 学习预览'}).waitFor({timeout:60000});
 const seed=createEmptyScheduleState();seed.settings.tutorialSeenVersion=1;const now=new Date().toISOString();
 seed.cues=Array.from({length:4},(_,i)=>({id:`shop-${i}`,subjectId:'math',subjectName:'数学',unit:'函数',subsection:'',type:'definition',prompt:`商店测试 ${i}`,answer:'答案',markingPoints:[],intervalDays:0,easeFactor:2.5,streak:0,createdAt:now,updatedAt:now} as StudyCue));
 let account=emptyCueGameAccount();account.earnings=[{id:'fixture',at:now,stars:5000,xp:5000,label:'fixture',sessionKey:'fixture'}];
 for(const id of ['theme-violet','title-first','frame-orbit','effect-solar'])account=equipCueShopItem(purchaseCueShopItem(account,id).account,id);
 seed.cueGameAccount=account;
 await page.evaluate(async value=>{
  const saved=new Promise<void>(resolve=>{const listener=(e:Event)=>{if((e as CustomEvent).detail.state==='saved'){window.removeEventListener('jackyun-local-durability',listener);resolve();}};window.addEventListener('jackyun-local-durability',listener);});
  localStorage.setItem('jackyun_schedule_control_v1',JSON.stringify(value));localStorage.setItem('jackyun_settings_learning_preferences',JSON.stringify({cueGameEnabled:true,cueShuffle:false,cueAmbientMotion:true,cueCelebrationMotion:true}));await saved;
 },seed);
 await page.reload();await page.getByRole('region',{name:'CUE 学习预览'}).getByRole('button',{name:'开始学习',exact:true}).click();
 const session=page.getByRole('dialog').filter({has:page.locator('[data-cue-study-page]')});await session.waitFor();
 await session.getByRole('button',{name:'隐藏游戏侧栏',exact:true}).click();
 assert.equal(await session.locator('[data-cue-universe-background]').count(),1,'hiding the sidebar must preserve the equipped star theme');
 console.log('PASS collapsed sidebar retains star background');
 assert.equal(await session.locator('[data-cue-universe-background]').getAttribute('data-cue-theme'),'violet');
 await session.getByRole('button',{name:'商店与装配',exact:true}).click();
 const shop=page.getByRole('dialog',{name:'星空商店',exact:true});await shop.waitFor();
 const nav=shop.getByRole('navigation',{name:'商品分类'});
 for(const name of ['星空主题','称号','侧栏装饰','积分兑换'])assert.equal(await nav.getByRole('button',{name,exact:true}).isVisible(),true);
 assert.equal(await shop.locator('article').count(),41,'all shop categories appear initially');
 const motion=shop.locator('details').first();
 await motion.locator('summary').click();
 await motion.getByRole('checkbox',{name:/^星空背景动画/}).uncheck();await motion.getByRole('button',{name:'保存设置',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('jackyun_settings_learning_preferences') || '{}').cueAmbientMotion===false);
 assert.equal(await session.locator('[data-cue-universe-background]').getAttribute('data-motion'),'false','disabling motion keeps the theme rendered');
 await motion.getByRole('checkbox',{name:/^星空背景动画/}).check();await motion.getByRole('button',{name:'保存设置',exact:true}).click();
 await motion.locator('summary').click();

 const buy=async(name:string)=>{const article=shop.locator('article').filter({has:page.getByRole('heading',{name,exact:true})});await article.getByRole('button',{name:'兑换并装备',exact:true}).click();await article.getByRole('button',{name:'卸下',exact:true}).waitFor();};
 await nav.getByRole('button',{name:'称号',exact:true}).click();await buy('晨光追寻者');await buy('好奇心飞行员');
 await nav.getByRole('button',{name:'侧栏装饰',exact:true}).click();await buy('彗尾信标');await buy('星芒铭牌');
 await shop.getByRole('button',{name:'预览 彗尾信标',exact:true}).click();
 await page.getByRole('dialog',{name:'彗尾信标预览',exact:true}).waitFor();
 await page.getByRole('button',{name:'关闭预览 · 彗尾信标',exact:true}).click();
 await nav.getByRole('button',{name:'粒子特效',exact:true}).click();await buy('螺旋星桥');await buy('星光花冠');
 await nav.getByRole('button',{name:'星空主题',exact:true}).click();await buy('翡翠星海');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cueGameAccount?.equipment.theme==='theme-emerald');
 const before=cueShopBalance((await page.evaluate(()=>JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}'))).cueGameAccount);
 await nav.getByRole('button',{name:'积分兑换',exact:true}).click();
 await shop.locator('article').filter({has:page.getByRole('heading',{name:'侦察积分包',exact:true})}).getByRole('button',{name:'兑换积分',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cueGameAccount?.purchases.some((item:{itemId:string})=>item.itemId==='credit-scout'));
 const after=cueShopBalance((await page.evaluate(()=>JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}'))).cueGameAccount);
 assert.equal(after.stars,before.stars+19);assert.equal(after.xp,before.xp-120);assert.equal(after.level,before.level);
 await page.setViewportSize({width:390,height:844});
 await nav.scrollIntoViewIfNeeded();
 for(const name of ['星空主题','称号','侧栏装饰','积分兑换']) { const button=nav.getByRole('button',{name,exact:true}); await button.scrollIntoViewIfNeeded(); assert.equal(await button.isVisible(),true); }
 await page.screenshot({path:'/tmp/cue-shop-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});
 await shop.screenshot({path:'/tmp/cue-shop-loadout.png'});
 await shop.getByRole('button',{name:'返回学习',exact:true}).click();
 assert.equal(await session.locator('[data-cue-collapsed-loadout] [data-cue-title]').count(),3);
 assert.equal(await session.locator('[data-cue-collapsed-loadout] [data-cue-frame]').count(),3);
 assert.equal(await session.locator('[data-cue-universe-background]').getAttribute('data-cue-theme'),'emerald');
 await page.waitForTimeout(300);
 await page.reload();await page.getByRole('region',{name:'CUE 学习预览'}).getByRole('button',{name:'继续学习',exact:true}).click();
 await session.waitFor();await session.getByRole('button',{name:'展开游戏侧栏',exact:true}).waitFor();
 assert.equal(await session.locator('[data-cue-collapsed-loadout] [data-cue-title]').count(),3,'all equipped titles survive reload');
 assert.equal(await session.locator('[data-cue-universe-background]').getAttribute('data-cue-theme'),'emerald');
 await page.screenshot({path:'/tmp/cue-shop-collapsed.png'});
 for(let i=0;i<4;i++) {
  await page.keyboard.press('1');
  await page.waitForFunction(count=>(JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cueReviews || []).length>=count,i+1);
  if(i<3)await page.keyboard.press('1');
 }
 const burst=session.locator('[data-cue-practice-burst]');await burst.waitFor();
 assert.equal(await burst.getAttribute('data-variant'),'3','the first equipped effect plays after four real retrievals');
 console.log('PASS all categories, stacked loadout, motion controls, previews, credits, reload and equipped particle playback');

 assert.deepEqual(errors,[]);
} finally {await browser.close();}
