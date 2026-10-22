/* eslint-disable @typescript-eslint/no-require-imports -- This browser runner is a CommonJS file. */
const {chromium}=require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
const out='artifacts/watch-pwa-browser';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const results=[];
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3138/schedule');
  const skip=page.getByRole('button',{name:'暂时跳过',exact:true});if(await skip.count())await skip.click();
  await page.locator('[data-portal-main]').waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.evaluate(()=>{const worker=navigator.serviceWorker.controller;worker.postMessage({type:'BIND_USER_CACHE',userId:'guest'});worker.postMessage({type:'WARM_OFFLINE_ROUTES'});});
  for(let attempt=0;attempt<120;attempt++){
   const ready=await page.evaluate(async()=>{
    const cache=await caches.open('jackyun-pwa-pages-v10');const keys=await cache.keys();
    return ['/schedule','/activity','/ai','/settings','/PracticeTimer.html'].every(path=>keys.some(key=>new URL(key.url).pathname===path));
   });
   if(ready)break;
   if(attempt===119)throw new Error('Warmup did not cover requested modules');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  const cached=await page.evaluate(async()=>({pages:(await(await caches.open('jackyun-pwa-pages-v10')).keys()).map(x=>new URL(x.url).pathname),assets:(await(await caches.open('jackyun-pwa-static-v11')).keys()).length}));
  assert.ok(cached.assets>10);results.push({warm:cached});
  await context.setOffline(true);
  for(const path of ['/schedule','/activity','/ai','/settings']){
   console.log('OFFLINE',path);fs.writeFileSync(out+'/progress.json',JSON.stringify(results,null,2));
   await page.goto('http://127.0.0.1:3138'+path,{waitUntil:'domcontentloaded'});await page.locator('[data-portal-main]').waitFor({timeout:20000}).catch(async e=>{await page.screenshot({path:out+'/failure.png',fullPage:true});fs.writeFileSync(out+'/failure.txt',await page.locator('body').innerText());fs.writeFileSync(out+'/errors.json',JSON.stringify(errors));throw e});
   assert.equal(await page.getByText('这个页面尚未保存在设备上。',{exact:false}).count(),0);
   await page.screenshot({path:out+'/'+path.slice(1)+'.png',fullPage:true});results.push({path,offline:true});
  }
  await page.goto('http://127.0.0.1:3138/PracticeTimer.html',{waitUntil:'domcontentloaded'});assert.match(await page.title(),/Practice|练习|Timer|计时/i);results.push({timer:true});
  await context.setOffline(false);await page.goto('http://127.0.0.1:3138/schedule');await page.locator('[data-portal-main]').waitFor();results.push({recovered:true,errors});
  fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
