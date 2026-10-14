import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolveErrorCode} from '../src/lib/error-codes.ts';
const require=createRequire(import.meta.url),{chromium}=require(process.env.JACKYUN_PLAYWRIGHT_PATH||'playwright');
const base=process.env.JACKYUN_TEST_URL||'http://127.0.0.1:3114';
const out=new URL('../.migration-private/error-system-verification/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.JackyunErrors));
  const result=await page.evaluate(async()=>{
    const response=await fetch('/api/sync/v3');return {status:response.status,body:await response.json()};
  });
  assert.ok([401,503].includes(result.status));
  const code=resolveErrorCode({status:result.status,code:result.body.error?.code||result.body.code});
  await page.locator(`[data-code="${code}"]`).waitFor();
  await page.screenshot({path:new URL('login-production.png',out).pathname.slice(1),fullPage:true});
  await page.goto(base+'/PracticeTimer.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.JackyunErrors));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jackyun:diagnostic',{detail:{level:'error',tag:'AIParse',message:'测试解析错误',data:{requestId:'local-verification'}}})));
  await page.locator('[data-code="JY-5001"]').waitFor();
  const evidence={base,rootLayout:true,unauthenticatedApi:{status:result.status,code},legacyHtml:true,moduleDiagnostic:true};
  await writeFile(new URL('live-results.json',out),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser.close();}
