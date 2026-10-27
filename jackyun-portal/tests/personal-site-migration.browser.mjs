import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';

const require=createRequire(import.meta.url),{webpack}=require('next/dist/compiled/webpack/webpack');
const root=process.cwd(),temp=await mkdtemp(path.join(tmpdir(),'personal-site-migration-'));
const owner='b779be26-a603-4b7c-90c6-e45b2cd0c84b';
const fixture={id:'f18846ab-14ad-48e2-a8cb-9ac0b5822221',name:'Legacy cloud fixture',schemaVersion:1,theme:'light',
  blocks:[{id:'block-1',type:'heading',text:'Synthetic website'}],updatedAt:'2026-10-27T00:00:00.000Z'};
await writeFile(path.join(temp,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';
import Studio from '${root.replaceAll('\\','/')}/src/components/modules/personal-site-studio';
import {initializeRepository} from '${root.replaceAll('\\','/')}/src/lib/sync/repository';
import {saveLocalSite} from '${root.replaceAll('\\','/')}/src/lib/personal-site-storage';
import {getDocuments} from '${root.replaceAll('\\','/')}/src/lib/sync/outbox';
async function start(){await initializeRepository('${owner}');await saveLocalSite({...${JSON.stringify(fixture)},name:'Unsynced local fixture'});
window.fixtureDocuments=getDocuments;createRoot(document.getElementById('root')!).render(<Studio/>);}start();`);
await writeFile(path.join(temp,'ai.ts'),'export function callAiApi(){throw Error("AI is outside this migration fixture");}');
await new Promise((resolve,reject)=>{
  const compiler=webpack({mode:'development',devtool:false,entry:path.join(temp,'entry.tsx'),output:{path:temp,filename:'bundle.js'},
    resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'@/lib/ai-config$':path.join(temp,'ai.ts'),'@':path.join(root,'src')}},
    module:{rules:[{test:/\.tsx?$/,use:path.join(root,'tests/support/typescript-browser-loader.cjs')}]}});
  compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error??Error(stats.toString({all:false,errors:true}))):resolve()));
});
const bundle=await readFile(path.join(temp,'bundle.js'));
const css=(await require('postcss')([require('tailwindcss')({content:[path.join(root,'src/components/modules/personal-site-studio.tsx')]})])
  .process('@tailwind base;@tailwind components;@tailwind utilities;:root{--card:#fff;--card-border:#ddd;--muted-foreground:#555}',{from:undefined})).css;
let posts=0;
const server=createServer(async(req,res)=>{
  if(req.url==='/api/personal-sites'){
    if(req.method!=='GET'){posts++;res.writeHead(500).end();return;}
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({ownerId:owner,sites:[{id:fixture.id,definition:fixture}]}));return;
  }
  res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':req.url==='/style.css'?'text/css':'text/html; charset=utf-8');
  res.end(req.url==='/bundle.js'?bundle:req.url==='/style.css'?css:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,scenarios=[];
const screenshots=path.resolve('../..','v5-personal-site-render');await mkdir(screenshots,{recursive:true});
let browser;
try{
  browser=await chromium.launch({headless:true,channel:process.env.JACKYUN_BROWSER_CHANNEL??'msedge'});
  for(const width of [1280,390])for(const offlineSource of [false,true]){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
    try{
      await context.route('**/*',route=>{
        if(new URL(route.request().url()).origin!==origin)return route.abort();
        if(offlineSource&&new URL(route.request().url()).pathname==='/api/personal-sites')return route.abort();
        return route.continue();
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin);
      await page.getByRole('button',{name:'Unsynced local fixture',exact:true}).waitFor();
      if(!offlineSource)await page.getByRole('button',{name:'Legacy cloud fixture (旧版云端副本)',exact:true}).waitFor();
      await page.getByRole('button',{name:'保存到同步队列',exact:true}).click();
      await page.getByRole('status').filter({hasText:'云端确认以同步状态为准'}).waitFor();
      const rows=await page.evaluate(()=>window.fixtureDocuments());
      assert.equal(rows.filter(row=>row.key.startsWith('jackyun_personal_site_v1:')&&row.value!==null).length,offlineSource?1:2);
      assert.equal(JSON.parse(rows.find(row=>row.key.endsWith('f18846ab-14ad-48e2-a8cb-9ac0b5822221')).value).name,'Unsynced local fixture');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(errors,[]);
      await page.screenshot({path:path.join(screenshots,`sites-${width}-${offlineSource?'offline':'online'}.png`),fullPage:true});
      scenarios.push({width,offlineSource,localEditPreserved:true,legacyCopyPreserved:!offlineSource,localSaveAvailable:true,pageErrors:errors});
    }finally{await context.close();}
  }
  assert.equal(posts,0,'the studio must not dual-write the independent legacy backup API');
  const result={environment:'isolated component browser with synthetic authenticated-owner fixture',realAuthenticationTested:false,
    physicalDevicesTested:false,productionChanged:false,legacyApiMutationRequests:posts,scenarios};
  await writeFile('docs/sync-v5-personal-site-browser-20261027.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
