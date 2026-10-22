import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.JACKYUN_PLAYWRIGHT_PATH||'playwright');
const script=await readFile('public/shared/error-notices.js','utf8');
const server=createServer((req,res)=>{if(req.url.startsWith('/api/')){res.statusCode=409;res.setHeader('content-type','application/json');res.end(JSON.stringify({conflict:req.url.includes('unknown')?'UNKNOWN':'ACTIVE_SESSION',code:'JY-2103',handled:true}));return;}res.setHeader('content-type','text/html;charset=utf-8');res.end('<html><script>'+script+'</script><body>Conflict regression</body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
try{for(const width of [1440,390]){const page=await browser.newPage({viewport:{width,height:900}});await page.goto('http://127.0.0.1:'+server.address().port);await page.evaluate(async()=>{await fetch('/api/practice-timer/live');});await page.waitForTimeout(200);assert.equal(await page.locator('[role=alert]').count(),0);
await page.evaluate(async()=>{await fetch('/api/unrelated');});await page.locator('[role=alert]').waitFor();await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('blocked');}}}));await page.getByRole('button',{name:'复制日志',exact:true}).click();assert.match(await page.getByRole('textbox',{name:'可复制的错误日志'}).inputValue(),/ACTIVE_SESSION/);
await page.reload();await page.evaluate(async()=>{await fetch('/api/practice-timer/live?unknown=1');});await page.locator('[role=alert]').waitFor();await page.close();}console.log('Handled timer conflicts retain diagnostics; unrelated and unknown 409 still alert (desktop/mobile).');}finally{await browser.close();server.close();}
