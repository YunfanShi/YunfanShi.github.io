import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const base=process.env.JACKYUN_TEST_URL || 'http://localhost:3100';
const out='artifacts/verification/device-layout';
await mkdir(out,{recursive:true});
const routes=[];
async function discover(dir){
 for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await discover(p);else if(e.name==='page.tsx'){const route='/'+path.relative('src/app/(portal)',path.dirname(p)).split(path.sep).join('/');if(!route.includes('[')&&!route.includes('/admin')&&!route.startsWith('/temp/'))routes.push(route);}}
}
await discover('src/app/(portal)');
const browser=await chromium.launch({headless:true,channel:'msedge'});const results=[];
try{
 for(const width of [390,1024]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:true});
  let index=0;
  await Promise.all(Array.from({length:3},async()=>{
   const page=await context.newPage();
   while(index<routes.length){
    const route=routes[index++];const errors=[];const listen=e=>errors.push(e.message);page.on('pageerror',listen);
    const r={route,width};
    try{const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:60000});r.status=response?.status();await page.waitForTimeout(2000);r.finalPath=new URL(page.url()).pathname;
      await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
      r.shell=await page.locator('[data-portal-main]').count()>0;
      r.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      const frame=page.frames().find(f=>f!==page.mainFrame()&&f.url()==='about:srcdoc');
      if(frame){await frame.waitForLoadState('domcontentloaded');r.legacy=true;r.legacyOverflow=await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);r.legacyAdaptive=await frame.locator('link[href="/shared/device-workspace.css"]').count()>0;await frame.locator('#jackyun-page-presentation').waitFor({state:'attached',timeout:10000});r.presentationReady=true;}
      r.errors=errors;
      if(['/schedule','/study','/settings','/ielts','/memory','/vocab','/review','/dashboard','/answer-sheet'].includes(route))await page.screenshot({path:out+'/page-'+route.slice(1)+'-'+width+'.png'});
    }catch(e){r.error=e.message;}
    page.off('pageerror',listen);results.push(r);console.log(JSON.stringify(r));
   }
   await page.close();
  }));
  await context.close();
 }
}finally{await browser.close();await writeFile(out+'/page-audit.json',JSON.stringify({routes:routes.length,results},null,2));}
const failures=results.filter(r=>r.status>=500||r.error||r.overflow||r.legacyOverflow||r.errors?.length);
console.log('Audited '+results.length+' route/device pairs; failures '+failures.length);
assert.deepEqual(failures,[]);
