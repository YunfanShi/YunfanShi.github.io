import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const require=createRequire(import.meta.url),root=process.cwd();
const out=path.resolve(process.env.JACKYUN_UI_ARTIFACTS||'artifacts/verification/sync-status-indicator');
await mkdir(out,{recursive:true});
const loader=path.join(out,'loader.cjs'),stub=path.join(out,'stubs.js'),cssInput=path.join(out,'input.css'),cssOutput=path.join(out,'style.css');
await writeFile(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(s){return ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
await writeFile(stub,"import React from 'react'; export const useLocalSaveState=()=> 'saved'; export default function Link({href,children,...props}) { return React.createElement('a',{href,...props},children); }");
await writeFile(cssInput,':root{--background:#f8f9fa;--foreground:#202124;--muted-foreground:#5f6368;--card:#fff;--card-border:#dadce0;--brand:#1a73e8}body{margin:0;padding:16px;font:14px Arial,sans-serif;color:var(--foreground)}#root{display:flex;justify-content:flex-end}.material-icons-round{display:inline-grid;width:20px;height:20px;overflow:hidden;place-items:center;font-size:0!important}.material-icons-round::after{content:"•";font:16px Arial,sans-serif}summary::-webkit-details-marker{display:none}@tailwind base;@tailwind components;@tailwind utilities;');
const webpack=require('next/dist/compiled/webpack/webpack').webpack;
await new Promise((resolve,reject)=>webpack({mode:'production',optimization:{minimize:false},entry:path.join(root,'tests/fixtures/sync-status-app.tsx'),output:{path:out,filename:'app.js'},resolve:{extensions:['.tsx','.ts','.js','.mjs'],alias:{'./local-durability$':stub,'next/link$':stub,'@':path.join(root,'src')}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]}]}},(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
const tailwind=spawnSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-i',cssInput,'-o',cssOutput,'--content','src/components/layout/sync-status-indicator.tsx','--minify'],{encoding:'utf8'});
if(tailwind.status)throw Error(tailwind.stderr);

const server=createServer(async(request,response)=>{
  if(request.url==='/app.js'){response.writeHead(200,{'Content-Type':'text/javascript'});response.end(await readFile(path.join(out,'app.js')));return;}
  if(request.url==='/style.css'){response.writeHead(200,{'Content-Type':'text/css'});response.end(await readFile(cssOutput));return;}
  response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  response.end(`<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><main id="root"></main><output id="retry-count" hidden>0</output><script src="/app.js"></script></body></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:process.env.JACKYUN_BROWSER_CHANNEL||'msedge'});
try{
  for(const width of [390,1440]){
    const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForTimeout(200);
    if(errors.length)throw Error(`Browser startup failed: ${errors.join('; ')}; ${await page.locator('#root').innerHTML()}`);
    const trigger=page.locator('summary[aria-label="更多同步详情"]');await trigger.waitFor({state:'visible'});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jackyun-local-sync-status',{detail:{state:'server_unavailable',pending:2,conflicts:1,lastSyncedAt:'2026-10-26T03:00:00.000Z',progress:'修改仍在本机队列，等待自动重试',consecutiveFailures:3,error:'fixture private upstream detail'}})));
    assert.equal(await page.getByRole('alert').count(),0,'transient sync failure is not shown as an interrupting alert');
    await trigger.click();const panel=page.locator('[data-sync-details]');await panel.getByText('同步诊断',{exact:true}).waitFor();
    await panel.getByText('服务暂不可用，后台会继续重试',{exact:true}).waitFor();
    await panel.getByText('待上传 2 项 · 待处理冲突 1 项',{exact:true}).waitFor();
    await panel.getByText('连续失败 3 次',{exact:true}).waitFor();
    assert.equal(await panel.getByText('fixture private upstream detail',{exact:true}).count(),0,'raw upstream detail stays in the full local logger');
    assert.equal(await panel.getByRole('link',{name:'打开同步中心'}).getAttribute('href'),'/settings?section=companion');
    assert.equal(await panel.getByRole('link',{name:'完整客户端日志'}).getAttribute('href'),'/settings?section=advanced');
    const bounds=await panel.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width,`diagnostics panel fits ${width}px viewport`);
    await page.screenshot({path:path.join(out,`sync-status-${width}.png`)});
    await panel.getByRole('button',{name:'立即重试同步'}).click();await page.waitForFunction(()=>document.getElementById('retry-count')?.textContent==='1');
    await trigger.click();await panel.waitFor({state:'hidden'});assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log('Sync status diagnostics passed on 390px and 1440px viewports.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
