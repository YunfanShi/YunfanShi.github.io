import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {canonicalJson} from '../src/lib/sync/hash.ts';
import {applyRecordDelta} from '../src/lib/sync/delta.ts';

const require=createRequire(import.meta.url),root=process.cwd(),out=path.resolve(process.env.JACKYUN_SYNC_REVIEW_OUT||'artifacts/verification/sync-review');
await mkdir(out,{recursive:true});
const loader=path.join(out,'loader.cjs'),stub=path.join(out,'stubs.js'),cssInput=path.join(out,'input.css');
await writeFile(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(s){return ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
await writeFile(stub,'export const useAuthMode=()=>({signedIn:true});export const createDueBackupVersions=async()=>({});');
await writeFile(cssInput,'@tailwind base;@tailwind components;@tailwind utilities;:root{--background:#f8f9fa;--foreground:#202124;--muted-foreground:#5f6368;--card:#fff;--card-border:#dadce0;}body{font-family:Arial,"Microsoft YaHei",sans-serif;color:var(--foreground);padding:20px;max-width:1180px;margin:auto;}');
const webpack=require('next/dist/compiled/webpack/webpack').webpack;
await new Promise((resolve,reject)=>webpack({mode:'production',optimization:{minimize:false},entry:path.join(root,'tests/fixtures/sync-review-app.tsx'),output:{path:out,filename:'app.js'},resolve:{extensions:['.tsx','.ts','.js','.mjs'],alias:{'@/components/auth/auth-mode-provider':stub,'@/actions/backup-center':stub,'@':path.join(root,'src')}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]}]}},(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
const tailwind=spawnSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-i',cssInput,'-o',path.join(out,'style.css'),'--content','src/components/settings/sync-center-panel.tsx,src/components/settings/sync-conflict-review.tsx','--minify'],{encoding:'utf8'});
if(tailwind.status)throw Error(tailwind.stderr);
const key='jackyun_schedule_control_v1',hash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const record=(value,revision)=>({key,value,revision,contentHash:hash(value),deleted:false,updatedAt:'2026-10-23T12:00:00Z'});
let fixture,cloud,calls=[],receipts=new Map(),manifestFailures=0,dropNextReply=false,writeCount=0,bodies=[];
function reset() {
  const base=record({cues:[{id:'a',title:'动量练习',text:'共同原文'}]},1),local={cues:[{id:'a',title:'动量练习',text:'本机答案'}]};
  cloud=record({cues:[{id:'a',title:'动量练习',text:'云端答案'},{id:'r',title:'云端独有题目',text:'保留这条'}]},2);
  const id=randomUUID();fixture={key,base,local,operation:{id,key,baseRevision:1,baseHash:base.contentHash,baseValue:base.value,baseDeleted:false,value:local,deleted:false,clientUpdatedAt:base.updatedAt},conflict:{operationId:id,key,baseRevision:1,baseValue:base.value,baseDeleted:false,localValue:local,localDeleted:false,remoteValue:cloud.value,remoteDeleted:false,remoteRevision:2,remoteHash:cloud.contentHash,remoteUpdatedAt:cloud.updatedAt,paths:['$.cues[a].text']}};
  calls=[];receipts=new Map();manifestFailures=0;dropNextReply=false;writeCount=0;bodies=[];
}
reset();
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1');
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    if(url.pathname==='/_fixture')return json(fixture);
    if(url.pathname.startsWith('/api/')) {
      calls.push({method:req.method,path:url.pathname});
      if(url.pathname==='/api/sync/devices')return json({devices:[]});
      if(url.pathname==='/api/sync/v3'){
        if(manifestFailures>0){manifestFailures--;return json({ok:false,error:{code:'TEMPORARY_FAILURE'}},503);}
        return json({ok:true,syncProtocol:3,records:[{...cloud,value:undefined}],next:null});
      }
      if(req.method==='GET')return json({ok:true,records:[cloud]});
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));
      bodies.push(Buffer.concat(chunks).toString());
      const applied=[],conflicts=[];
      for(const op of body.operations) {
        if(receipts.has(op.id)){applied.push(receipts.get(op.id));continue;}
        if(op.baseRevision!==cloud.revision||op.baseHash!==cloud.contentHash){conflicts.push({...fixture.conflict,operationId:op.id,remoteValue:cloud.value,remoteRevision:cloud.revision,remoteHash:cloud.contentHash});continue;}
        const value=applyRecordDelta(cloud.value,op.patch);cloud=record(value,cloud.revision+1);writeCount++;
        const receipt={operationId:op.id,key,revision:cloud.revision,contentHash:cloud.contentHash};receipts.set(op.id,receipt);applied.push(receipt);
      }
      if(dropNextReply){dropNextReply=false;return json({ok:false,error:{code:'REPLY_LOST_AFTER_COMMIT'}},503);}
      return json({ok:true,applied,conflicts,remote:[]});
    }
    if(url.pathname==='/app.js'||url.pathname==='/style.css'){res.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'text/javascript':'text/css'});res.end(await readFile(path.join(out,url.pathname.slice(1))));return;}
    if(/^\/shared\/[a-z-]+\.js$/.test(url.pathname)){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await readFile(path.join(root,'public',url.pathname)));return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><main id="root"></main><script src="/app.js"></script></body></html>');
  }catch(error){res.writeHead(500);res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,channel:'msedge'}),results=[];
async function pageFor(width) {
  reset();const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.getByRole('heading',{name:'检查差异并决定合并结果'}).waitFor();
  await page.getByRole('button',{name:'上传此合并结果',exact:true}).waitFor({state:'visible'});
  assert.equal(await page.getByRole('button',{name:'上传此合并结果',exact:true}).isEnabled(),false);
  return {context,page,errors};
}
async function upload(page) {
  await page.getByRole('button',{name:'上传此合并结果',exact:true}).click();
  await page.getByRole('button',{name:'确认继续',exact:true}).click();
  await page.getByText('数据已自动同步',{exact:true}).waitFor();
}
try {
  {
    const {context,page,errors}=await pageFor(1440);
    await page.getByLabel('只看需要选择').check();
    await page.getByRole('button',{name:'使用云端',exact:true}).click();
    await page.getByText('预览将上传的结果',{exact:true}).click();
    assert.ok(await page.locator('pre').filter({hasText:'云端独有题目'}).count());
    await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
    await upload(page);assert.equal(cloud.value.cues[0].text,'云端答案');assert.equal(cloud.value.cues.length,2);
    assert.equal(calls.filter(c=>c.method==='GET'&&c.path==='/api/sync/v2').length,0);assert.deepEqual(errors,[]);
    results.push('Desktop per-field choice, preview, actual coordinator/IndexedDB upload and no full redownload');await context.close();
  }
  {
    const {context,page,errors}=await pageFor(390);
    await page.getByRole('button',{name:'以本机完整内容作为结果',exact:true}).click();
    await page.getByText('预览将上传的结果',{exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
    await upload(page);assert.deepEqual(cloud.value,fixture.local);assert.deepEqual(errors,[]);
    results.push('Mobile exact local result, no horizontal overflow and acknowledged upload');await context.close();
  }
  {
    const {context,page,errors}=await pageFor(1024),input=page.getByLabel('导入本地 JSON 作为结果',{exact:true});
    await input.setInputFiles({name:'wrong-key.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'jackyun-sync-merge-v1',key:'other',value:{},deleted:false}))});
    await page.getByRole('alert').filter({hasText:'其他同步项目'}).waitFor();
    const merged={cues:[{id:'import',title:'导入的合并答案',text:'核对后提交'}]};
    await input.setInputFiles({name:'my-merge.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(merged))});
    await page.getByText('使用my-merge.json',{exact:true}).waitFor();
    assert.deepEqual(cloud.value,fixture.conflict.remoteValue);
    await upload(page);assert.deepEqual(cloud.value,merged);assert.deepEqual(errors,[]);
    results.push('Tablet JSON import validates key, changes preview only, then uploads the reviewed result');await context.close();
  }
  {
    const {context,page,errors}=await pageFor(1440);
    await page.getByRole('button',{name:'以本机完整内容作为结果',exact:true}).click();
    cloud=record({cues:[{id:'a',title:'动量练习',text:'预览之后的云端更新'},{id:'r',title:'云端独有题目',text:'保留这条'}]},3);
    await page.getByRole('button',{name:'上传此合并结果',exact:true}).click();await page.getByRole('button',{name:'确认继续',exact:true}).click();
    await page.getByText('云端版本 3',{exact:true}).waitFor();
    await page.getByText('冲突中的内容又有变化，对比已刷新；请检查最新差异后提交。',{exact:true}).waitFor();
    assert.equal(calls.filter(c=>c.method==='POST').length,0);
    assert.ok(await page.getByText('预览之后的云端更新',{exact:true}).count());
    await page.getByRole('button',{name:'使用本机',exact:true}).first().click();
    await upload(page);assert.equal(cloud.value.cues[0].text,'本机答案');assert.equal(cloud.value.cues.length,2);assert.deepEqual(errors,[]);
    results.push('A cloud edit after preview refreshes the comparison without upload or backoff; reviewed retry succeeds');await context.close();
  }
  {
    const {context,page,errors}=await pageFor(390);
    await page.getByRole('button',{name:'以本机完整内容作为结果',exact:true}).click();manifestFailures=2;
    await page.getByRole('button',{name:'上传此合并结果',exact:true}).click();await page.getByRole('button',{name:'确认继续',exact:true}).click();
    await page.getByText('同步请求未完成 (503 · TEMPORARY_FAILURE)',{exact:true}).waitFor();
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.getByText('数据已自动同步',{exact:true}).waitFor();assert.deepEqual(cloud.value,fixture.local);assert.deepEqual(errors,[]);
    results.push('A transient failure preserves the reviewed merge selection; reconnect uploads it without a second confirmation');await context.close();
  }
  {
    const {context,page,errors}=await pageFor(1440);
    await page.getByRole('button',{name:'以本机完整内容作为结果',exact:true}).click();dropNextReply=true;
    await page.getByRole('button',{name:'上传此合并结果',exact:true}).click();await page.getByRole('button',{name:'确认继续',exact:true}).click();
    await page.getByText('修改已保存在本机，联网后自动同步',{exact:true}).waitFor();
    const newest={cues:[{id:'a',title:'动量练习',text:'提交后继续编辑的新答案'}]};
    await page.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:newest});
    await page.reload();await page.getByText('数据已自动同步',{exact:true}).waitFor();
    assert.deepEqual(cloud.value,newest);assert.equal(bodies[0],bodies[1]);assert.equal(writeCount,2);assert.deepEqual(errors,[]);
    results.push('Committed response lost, newer local edit, full browser reload: immutable receipt replay and final convergence with exactly two writes');await context.close();
  }
  await writeFile(path.join(out,'results.json'),JSON.stringify({passed:results.length,checks:results,fixture:'Real components, coordinator, engine and IndexedDB; synthetic authentication and loopback cloud'},null,2));
  console.log(JSON.stringify(results,null,2));
}finally{await browser.close();server.close();}
