import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.JACKYUN_PLAYWRIGHT_PATH||'playwright');
const base=process.env.JACKYUN_TEST_URL||'http://localhost:3112';
const out=process.env.JACKYUN_WATCH_ARTIFACTS||'artifacts/verification/watch';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const results=[];
try{
 for(const width of [390,800,1440]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width!==1440});
  const page=await context.newPage();let approved=0,revoked=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/watch/v1/**',route=>{
   const path=new URL(route.request().url()).pathname;let value={};
   if(path.endsWith('/devices'))value={devices:[{id:'test-device',name:'WATCH 4 测试设备',last_seen_at:new Date().toISOString(),revoked_at:revoked?new Date().toISOString():null}]};
   else if(path.endsWith('/inspect'))value={id:'test-pair',name:'WATCH 4 测试设备',accountLabel:'测试账号',expiresAt:new Date(Date.now()+300000).toISOString()};
   else if(path.endsWith('/approve')){approved++;value={ok:true};}
   else if(path.endsWith('/revoke')){revoked++;value={ok:true};}
   return route.fulfill({json:value});
  });
  const response=await page.goto(base+'/settings/watch',{waitUntil:'domcontentloaded',timeout:60000});
  assert.equal(response.status(),200);assert.match(response.headers()['permissions-policy'],/camera=\(self\)/);
  await page.getByRole('heading',{name:'手表登录与设备管理'}).waitFor();
  await page.getByText('WATCH 4 测试设备',{exact:true}).waitFor();
  await page.getByRole('textbox',{name:'配对码或登录二维码内容'}).fill('12345678');
  await page.getByRole('button',{name:'查看配对请求'}).click();
  try{await page.getByRole('button',{name:'确认登录这块手表'}).waitFor();}catch(error){await page.screenshot({path:out+'/watch-failure.png',fullPage:true});console.log(await page.locator('body').innerText());throw error;}assert.equal(approved,0);
  await page.screenshot({path:`${out}/watch-login-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'确认登录这块手表'}).click();
  await page.getByRole('status').filter({hasText:'已授权'}).waitFor();assert.equal(approved,1);
  await page.getByRole('button',{name:'撤销授权',exact:true}).click();
  await page.getByRole('status').filter({hasText:'授权已撤销'}).waitFor();assert.equal(revoked,1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);results.push({width,explicitApproval:true,revocation:true,noOverflow:true,errors});
  await context.close();
 }
}finally{await browser.close();await writeFile(out+'/browser-results.json',JSON.stringify(results,null,2));}
console.log(JSON.stringify(results));
