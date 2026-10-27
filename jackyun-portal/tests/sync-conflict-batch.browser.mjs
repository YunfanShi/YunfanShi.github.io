import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),root=process.cwd(),out=path.resolve('.migration-private/batch-ui');
await mkdir(out,{recursive:true});
const loader=path.join(out,'loader.cjs'),stub=path.join(root,'tests/fixtures/sync-batch-stubs.js');
await writeFile(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;`);
const alias=Object.fromEntries(['lib/sync/repository','lib/site-dialog','lib/local-workspace','lib/request-timeout','lib/sync/status','components/auth/auth-mode-provider','lib/sync/outbox','lib/backup/pages','lib/offline/workspace','lib/sync/scheduler','components/layout/local-durability'].map(name=>['@/'+name+'$',stub]));
alias['./sync-conflict-review$']=stub;alias['@']=path.join(root,'src');
await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'production',optimization:{minimize:false},entry:path.join(root,'tests/fixtures/sync-batch-app.tsx'),output:{path:out,filename:'app.js'},resolve:{extensions:['.tsx','.ts','.js'],alias},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]}]}},(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
await writeFile(path.join(out,'input.css'),':root{--background:#fff;--card:#fff;--card-border:#ddd;--muted-foreground:#555}body{font:14px Arial;margin:16px}.material-icons-round{display:none}@tailwind base;@tailwind components;@tailwind utilities;');
const css=spawnSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-i',path.join(out,'input.css'),'-o',path.join(out,'style.css'),'--content','src/components/settings/sync-center-panel.tsx','--minify'],{encoding:'utf8'});if(css.status)throw Error(css.stderr);
const server=createServer(async(req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':req.url==='/style.css'?'text/css':'text/html; charset=utf-8');res.end(req.url==='/app.js'?await readFile(path.join(out,'app.js')):req.url==='/style.css'?await readFile(path.join(out,'style.css')):'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true,channel:'chrome'});
try{for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);const cloud=page.getByRole('button',{name:'全部使用云端',exact:true});await cloud.waitFor();
  page.once('dialog',dialog=>dialog.dismiss());await cloud.click();assert.equal(await page.evaluate(()=>window.batchEvents.length),0);
  page.once('dialog',dialog=>dialog.accept());await cloud.click();await page.waitForFunction(()=>window.batchEvents.length===1);
  const remote=await page.evaluate(()=>window.batchEvents[0]);assert.equal(remote.legacy.length,1);assert.equal(remote.resources.length,2);assert.equal(remote.legacy[0].choice,'remote');
  assert.equal(await cloud.isDisabled(),true);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jackyun-local-sync-status',{detail:{state:'conflict',pending:0,conflicts:3,lastSyncedAt:null}})));
  const local=page.getByRole('button',{name:'全部使用本地',exact:true});await local.waitFor();page.once('dialog',dialog=>dialog.accept());await local.click();await page.waitForFunction(()=>window.batchEvents.length===2);
  const chosen=await page.evaluate(()=>window.batchEvents[1]);assert.equal(chosen.legacy[0].choice,'merged');assert.deepEqual(chosen.legacy[0].review.value,{local:true});assert.equal(chosen.resources[0].choice,'local');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,`batch-${width}.png`)});assert.deepEqual(errors,[]);
  await page.evaluate(()=>{window.fixtureEmpty=true;window.dispatchEvent(new CustomEvent('jackyun-local-sync-status',{detail:{state:'synced',pending:0,conflicts:0,lastSyncedAt:null}}));});await cloud.waitFor({state:'hidden'});await page.close();
}console.log('Batch conflict UI passed: cancel, cloud/local payload, disabled state, empty state, 390/1440px.');}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
