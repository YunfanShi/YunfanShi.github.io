import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const host=`<!doctype html><iframe title="timer" style="width:100%;height:850px" src="/PracticeTimer.html"></iframe><script>
const state={timetable:null,practiceSessions:[]};
addEventListener('message',e=>{const m=e.data;if(m.type==='practice-ready')e.source?.postMessage({type:'practice-state',state},location.origin);if(m.type==='practice-save'){if(m.session){state.practiceSessions=state.practiceSessions.filter(x=>x.id!==m.session.id);state.practiceSessions.push(m.session);}e.source?.postMessage({type:'practice-saved',requestId:m.requestId,localOnly:true},location.origin);}});
</script>`;
const server=createServer(async(req,res)=>{
 if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(host);return;}
 if(req.url?.startsWith('/api/')){res.writeHead(401,{'Content-Type':'application/json'});res.end('{}');return;}
 try{const name=new URL(req.url,'http://localhost').pathname;const data=await readFile(new URL('../public'+name,import.meta.url));const ext=name.split('.').pop();res.writeHead(200,{'Content-Type':ext==='js'?'text/javascript':ext==='css'?'text/css':'text/html'});res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 const frame=page.frameLocator('iframe');await frame.locator('#openJsonImport').click();
 const data={format:'jackyun-practice-v1',title:'Forces',subject:'Mechanics',questions:[{name:'Q1',type:'力',text:'试画图',seconds:{exam:60,normal:90,relaxed:120}},{name:'Q2',type:'运动',seconds:{exam:120,normal:150,relaxed:180}}]};
 await frame.locator('#jsonInput').fill(JSON.stringify(data));await frame.locator('#startJsonImport').click();await frame.locator('#workspace').waitFor({state:'visible'});
 assert.equal(await frame.locator('#workspaceTypeButton').isHidden(),true);await frame.locator('#toggle').click();await frame.locator('[data-import-mode="exam"]').click();
 await frame.locator('#questionInfoButton').click();await frame.locator('#result').selectOption('wrong');await frame.locator('#closeQuestionInfo').click();
 await frame.locator('#next').click();await frame.locator('[data-import-mode="relaxed"]').click();await frame.locator('#queue [data-question="0"]').click();await frame.locator('#toggle').click();await page.waitForTimeout(1200);await frame.locator('#toggle').click();
 await frame.locator('#notice').getByText(/仅保存在本机/).waitFor();await page.locator('iframe').evaluate(el=>el.contentWindow.location.reload());await frame.locator('#unfinishedSessions').waitFor({state:'visible'});await frame.locator('#unfinishedRows button').click();await frame.locator('#workspace').waitFor({state:'visible'});assert.match(await frame.locator('#questionLabel').innerText(),/Q1.*模考/);
 await frame.locator('#next').click();assert.equal(await frame.locator('#importTiming').isVisible(),false);assert.match(await frame.locator('#questionLabel').innerText(),/Q2.*宽松/);await frame.locator('#finish').click();await frame.locator('#report').waitFor({state:'visible'});
 const [download]=await Promise.all([page.waitForEvent('download'),frame.locator('#export').click()]);const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);const result=JSON.parse(Buffer.concat(chunks).toString());
 assert.deepEqual(result.session.questions.map(q=>q.timingMode),['exam','relaxed']);assert.equal(result.session.questions[0].timingOptions.normal,90);assert.equal(result.session.questions[0].firstAttempt.result,'wrong');assert.ok(result.session.questions[0].elapsedMs>=1000);assert.equal(errors.length,0,errors.join('\n'));console.log('Imported two questions, chose independent time tiers, and exported their report.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}


