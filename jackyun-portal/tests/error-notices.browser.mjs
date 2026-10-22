import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.JACKYUN_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../public/',import.meta.url),out=new URL('../.migration-private/error-system-verification/',import.meta.url);
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  if(req.url.startsWith('/api/test')){
    res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:{code:'SYNC_WRITE_FAILED',message:'failed'},requestId:'test-request'}));return;
  }
  if(req.url==='/fixture'){
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/shared/error-notices.js"></script><body><h1>错误系统验证</h1><label>当前输入<input id="draft"></label></body></html>');return;
  }
  try{const path=new URL('.'+req.url.split('?')[0],root);assert.ok(path.href.startsWith(root.href));res.setHeader('Content-Type',path.pathname.endsWith('.js')?'text/javascript':'text/html');res.end(await readFile(path));}
  catch{res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,channel:process.env.JACKYUN_BROWSER_CHANNEL||'msedge'});
const results=[];
try{
  for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:900},permissions:['clipboard-read','clipboard-write']});
    const page=await context.newPage();await page.clock.install();await page.clock.pauseAt(Date.now()+1000);await page.goto(base+'/fixture');
    await page.locator('#draft').fill('保留的输入');await page.locator('#draft').focus();
    await page.evaluate(async()=>{await fetch('/api/test?token=private-value');});
    const card=page.locator('[data-code="JY-2102"]');await card.waitFor();
    assert.equal(await page.locator('#draft').evaluate(element=>element===document.activeElement),true,'errors never steal input focus');
    assert.ok((await card.locator('.message').textContent()).includes('本次修改尚未被云端确认'));
    const box=await card.boundingBox();assert.ok(box.x>=0 && box.x+box.width<=width);assert.ok(box.y>=72,'error notices stay below the portal top bar');
    await page.locator('#draft').click();
    assert.equal(await page.locator('#draft').evaluate(element=>element===document.activeElement),true,'non-action areas of error notices let underlying controls receive clicks');
    await card.getByRole('button',{name:'复制日志',exact:true}).click();await card.getByRole('button',{name:'已复制'}).waitFor();
    const copied=await page.evaluate(()=>navigator.clipboard.readText());
    assert.match(copied,/JY-2102|test-request/);assert.match(copied,/SYNC_WRITE_FAILED/);assert.doesNotMatch(copied,/private-value/);
    await page.evaluate(()=>{for(let i=0;i<20;i++)window.JackyunErrors.report({code:'SYNC_WRITE_FAILED',url:location.origin+'/api/test'});});
    assert.equal(await page.locator('[data-code="JY-2102"]').count(),1);
    await page.evaluate(()=>window.JackyunErrors.report({code:'STORAGE_FAILED',password:'hidden-password',message:'token=hidden-token'}));
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));
    const storage=page.locator('[data-code="JY-3101"]');await storage.getByRole('button',{name:'复制日志',exact:true}).click();
    const text=await storage.getByRole('textbox',{name:'可复制的错误日志'}).inputValue();assert.doesNotMatch(text,/hidden-password|hidden-token/);
    await page.screenshot({path:new URL(`toast-${width}.png`,out).pathname.slice(1),fullPage:true});
    await storage.getByRole('button',{name:'关闭错误提示'}).click();assert.equal(await storage.count(),0);
    await page.evaluate(async()=>{try{await fetch('/api/test',{signal:AbortSignal.abort()});}catch{}});
    assert.equal(await page.locator('[role="alert"]').count(),1);
    await page.clock.fastForward(9000);
    await page.evaluate(()=>window.JackyunErrors.report({code:'SYNC_WRITE_FAILED',url:location.origin+'/api/test'}));
    await page.clock.fastForward(9000);await page.evaluate(()=>window.JackyunErrors.report({code:'SYNC_WRITE_FAILED',url:location.origin+'/api/test'}));
    await page.clock.fastForward(11999);assert.equal(await page.locator('[role="alert"]').count(),1);
    await page.clock.fastForward(1);assert.equal(await page.locator('[role="alert"]').count(),0);
    await page.evaluate(()=>window.JackyunErrors.report({code:'AI_PARSE_FAILED'}));
    // Headless Chromium emulates every tab as focused; exercise native event
    // listeners with controlled visibility instead of relying on tab focus.
    await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.locator('[role="alert"]').count(),0);
    await page.evaluate(()=>window.JackyunErrors.report({code:'SYNC_WRITE_FAILED',message:'background-marker'}));
    assert.equal(await page.locator('[role="alert"]').count(),0);
    await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.locator('[role="alert"]').count(),0);
    await page.evaluate(()=>window.JackyunErrors.report({code:'AI_PARSE_FAILED'}));
    const foreground=page.locator('[data-code="JY-5001"]');await foreground.getByRole('button',{name:'复制日志',exact:true}).click();
    assert.match(await foreground.getByRole('textbox',{name:'可复制的错误日志'}).inputValue(),/background-marker/);
    await page.evaluate(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});window.dispatchEvent(new Event('blur'));window.JackyunErrors.report({code:'AI_PARSE_FAILED'});});
    assert.equal(await page.locator('[role="alert"]').count(),0);
    await page.evaluate(()=>{delete document.hasFocus;});
    await page.goto(base+'/docs/errors.html');assert.equal(await page.locator('tbody tr').count(),25);
    results.push({width,message:true,code:true,copy:true,redaction:true,clipboardFallback:true,focusPreserved:true,boundedRepeatedErrors:true,abortSilent:true,autoHide30Seconds:true,retriesDoNotExtend:true,backgroundSilent:true,noReplay:true,backgroundLogsPreserved:true,docs:true});
    await context.close();
  }
  await writeFile(new URL('results.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();server.close();}
