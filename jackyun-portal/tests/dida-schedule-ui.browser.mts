import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { harness } from './helpers/dida-schedule-harness.mts';
/* eslint-disable @typescript-eslint/no-explicit-any -- Browser fixture loads isolated transpiled modules dynamically. */
const require=createRequire(import.meta.url);const ts=require('typescript');const {chromium}=require(process.env.JACKYUN_PLAYWRIGHT_PATH||'playwright');
const out='artifacts/verification/dida-schedule';await mkdir(out,{recursive:true});
const modules:Record<string,string>={};
for(const [name,file] of Object.entries({react:'react/cjs/react.development.js',scheduler:'scheduler/cjs/scheduler.development.js','react-dom':'react-dom/cjs/react-dom.development.js','react-dom/client':'react-dom/cjs/react-dom-client.development.js','react/jsx-runtime':'react/cjs/react-jsx-runtime.development.js'}))modules[name]=readFileSync(new URL('../node_modules/'+file,import.meta.url),'utf8');
for(const [name,file] of Object.entries({'@/lib/integrations/dida-schedule':'../src/lib/integrations/dida-schedule.ts',component:'../src/components/modules/schedule/dida-schedule-sync.tsx'}))modules[name]=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const browser=await chromium.launch({headless:true,channel:'msedge'});const checks=[];
try {
 for(const refuseChange of [false,true]){
  const h=harness({refuseChange,rows:[{id:'parent',projectId:'p',title:'Parent plan',status:0,startDate:'2026-10-15T00:00:00+0800',isAllDay:true},{id:'task',projectId:'p',title:'Own task',parentId:'parent',status:0,startDate:'2026-10-14T00:00:00+0800',isAllDay:true,items:[{id:'pending-check',title:'Pending checklist item',status:0},{id:'done-check',title:'Hidden completed checklist item',status:1}]},{id:'finished',projectId:'p',title:'Hidden completed task',status:2}]});const context=await browser.newContext({viewport:{width:820,height:1180}});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message));
  await page.route('http://schedule.test/**',async route=>{
   const request=route.request();const url=new URL(request.url());
   if(url.pathname.startsWith('/api/')){
    const handler=h.exports[request.method()];const response=await handler(new Request(request.url(),{method:request.method(),...(request.postData()?{headers:{'Content-Type':'application/json'},body:request.postData()}:{})}));
    await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
   }else await route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'});
  });
  await page.goto('http://schedule.test/');
  await page.evaluate(sources=>{
   const cache:Record<string,{exports:unknown}>={};const load=(name:string):any=>{if(cache[name])return cache[name].exports;const moduleRecord={exports:{}};cache[name]=moduleRecord;new Function('module','exports','require','process',sources[name])(moduleRecord,moduleRecord.exports,load,{env:{NODE_ENV:'development'}});return moduleRecord.exports;};
   const React=load('react');const root=load('react-dom/client').createRoot(document.getElementById('root'));root.render(React.createElement(load('component').default,{accounts:[{id:'11111111-1111-4111-8111-111111111111',displayName:'Test Dida',provider:'dida365',status:'active'}],selectedDate:'2026-10-14',onTaskCount:(count:number)=>document.getElementById('root')!.setAttribute('data-pending-count',String(count))}));
  },modules);
  const complete=page.getByRole('button',{name:'完成 Own task',exact:true});await complete.waitFor();assert.equal(await page.getByRole('button',{name:'完成 Parent plan',exact:true}).isDisabled(),true);assert.equal(await page.getByText('Pending checklist item',{exact:true}).count(),1);assert.equal(await page.getByText('Hidden completed checklist item',{exact:true}).count(),0);assert.equal(await page.getByText('Hidden completed task',{exact:true}).count(),0);assert.equal(await complete.locator('..').getAttribute('data-depth'),'1');assert.equal(await page.locator('#root').getAttribute('data-pending-count'),'1');await complete.click();
  if(refuseChange){await page.getByRole('status').filter({hasText:'滴答尚未确认'}).waitFor();assert.equal(await complete.getAttribute('aria-pressed'),'false');checks.push({failedRemoteDoesNotMarkComplete:true});}
  else {
   await page.waitForFunction(()=>document.getElementById('root')!.getAttribute('data-pending-count')==='0');
   assert.equal(h.task.status,2);assert.equal(await complete.count(),0);assert.equal(await page.getByText('Previously completed',{exact:true}).count(),0);
   await page.getByRole('button',{name:'同步范围'}).click();const list=page.getByRole('checkbox',{name:'My list',exact:true});await list.uncheck();await page.getByRole('button',{name:'保存同步范围'}).click();await page.getByText('点击同步范围，选择要同步的滴答清单。').waitFor();assert.deepEqual(h.getSettings().syncProjectIds,[]);
   checks.push({completedTaskHidden:true,selectionSaved:true,noCheckboxBeforeConfirmation:true});
  }
  assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/${refuseChange?'failure':'success'}.png`});await context.close();
 }
}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify(checks,null,2));}
console.log(JSON.stringify(checks,null,2));
