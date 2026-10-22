import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.JACKYUN_PLAYWRIGHT_PATH||'playwright');
const script=await readFile(new URL('../public/shared/error-notices.js',import.meta.url),'utf8');
const baseOverride=process.env.JACKYUN_TEST_URL;
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<html><script>'+script+'</script><body><h1>错误静默验证</h1><input aria-label="输入" value="保留内容"></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=baseOverride||'http://127.0.0.1:'+server.address().port;
const out=process.env.JACKYUN_SCREENSHOT_DIR||'../docs/backend-load-and-errors-3.25.0/verification';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
try{for(const width of [1440,390]){
 const start=Date.now(),context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();await page.clock.install({time:new Date(start)});await page.clock.pauseAt(start+1000);await page.goto(base);
 const logs=[];page.on('console',msg=>{if(msg.type()==='error')logs.push(msg.text());});
 await page.evaluate(()=>{window.JackyunErrors.report({code:'SYNC_WRITE_FAILED',url:location.origin+'/api/a'});window.JackyunErrors.report({code:'JY-2102',url:location.origin+'/api/b'});});
 assert.equal(await page.locator('[data-code="JY-2102"]').count(),2);
 await page.locator('[data-code="JY-2102"]').first().getByRole('button',{name:'关闭错误提示'}).click();assert.equal(await page.locator('[role=alert]').count(),0);
 await page.evaluate(()=>{console.error('muted-console-marker',{code:'SYNC_WRITE_FAILED'});window.JackyunErrors.report({code:'JY-2102',url:location.origin+'/other'});window.JackyunErrors.report({code:'STORAGE_FAILED'});});
 assert.equal(await page.locator('[data-code="JY-2102"]').count(),0);assert.equal(await page.locator('[data-code="JY-3101"]').count(),1);assert.ok(logs.some(x=>x.includes('muted-console-marker')));
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('blocked');}}}));
 await page.getByRole('button',{name:'复制日志',exact:true}).click();assert.match(await page.getByRole('textbox',{name:'可复制的错误日志'}).inputValue(),/muted-console-marker/);
 const other=await context.newPage();await other.clock.install({time:new Date(start)});await other.clock.pauseAt(start+1000);await other.goto(base);
 await other.evaluate(()=>window.JackyunErrors.report({code:'SYNC_WRITE_FAILED'}));assert.equal(await other.locator('[role=alert]').count(),0);
 await page.reload();await page.evaluate(()=>window.JackyunErrors.report({code:'SYNC_WRITE_FAILED'}));assert.equal(await page.locator('[role=alert]').count(),0);
 await page.clock.fastForward(29*60*1000);await page.evaluate(()=>window.JackyunErrors.report({code:'SYNC_WRITE_FAILED',message:'29-minute-marker'}));assert.equal(await page.locator('[role=alert]').count(),0);
 await page.clock.fastForward(60*1000);await page.evaluate(()=>window.JackyunErrors.report({code:'SYNC_WRITE_FAILED'}));assert.equal(await page.locator('[data-code="JY-2102"]').count(),1,'suppressed retries must not extend the original deadline');
 await page.screenshot({path:out+'/mute-expired-'+width+'.png'});
 // Automatic expiry is distinct from closing and should not mute the type.
 await page.clock.fastForward(30000);await page.evaluate(()=>window.JackyunErrors.report({code:'SYNC_WRITE_FAILED'}));assert.equal(await page.locator('[data-code="JY-2102"]').count(),1);
 await context.close();
 const fallback=await browser.newContext({viewport:{width,height:900}}),p=await fallback.newPage();await p.goto(base);await p.evaluate(()=>{Object.defineProperty(window,'localStorage',{configurable:true,get(){throw Error('blocked');}});window.JackyunErrors.report({code:'STORAGE_FAILED'});});await p.getByRole('button',{name:'关闭错误提示'}).click();await p.evaluate(()=>window.JackyunErrors.report({code:'STORAGE_FAILED'}));assert.equal(await p.locator('[role=alert]').count(),0);await fallback.close();
 results.push({width,sameCodeAliasesAndDifferentSources:true,otherTypesVisible:true,reload:true,otherTab:true,expiresAt30Minutes:true,retriesDoNotExtend:true,autoExpiryDoesNotMute:true,consoleAndDiagnosticLogsPreserved:true,storageBlockedFallback:true});
}}finally{await browser.close();server.close();}
await writeFile(out+'/error-mute-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
