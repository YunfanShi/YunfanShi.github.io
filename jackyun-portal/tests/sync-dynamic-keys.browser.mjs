import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,extname,sep} from 'node:path';
import {chromium} from 'playwright';
import {isSyncableStorageKey} from '../src/lib/local-workspace.ts';
import {legacyWorkspaceRecordId} from '../src/lib/sync/resource-model.ts';

const publicRoot=resolve('public');
const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml'};
const server=createServer(async(request,response)=>{
  try{
    if(!['GET','HEAD'].includes(request.method)){response.writeHead(405).end();return;}
    const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
    const file=resolve(publicRoot,`.${pathname}`),within=relative(publicRoot,file);
    if(within==='..'||within.startsWith(`..${sep}`)){response.writeHead(403).end();return;}
    const bytes=await readFile(file);
    response.writeHead(200,{'Content-Type':contentTypes[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});
    response.end(request.method==='HEAD'?undefined:bytes);
  }catch{response.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
const scenarios=[];
async function sample(source,run,seed={},expected=[]){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
  try{
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await context.addInitScript(initial=>{
      for(const [key,value] of Object.entries(initial))localStorage.setItem(key,JSON.stringify(value));
      const events=[];
      window.__v5StorageKeyEvents=events;
      for(const operation of ['getItem','setItem','removeItem']){
        const original=Storage.prototype[operation];
        Storage.prototype[operation]=function(key,...args){
          if(this===localStorage)events.push({operation,key:String(key)});
          return original.call(this,key,...args);
        };
      }
    },seed);
    const page=await context.newPage();
    await page.goto(`${origin}/${source.replace(/^public\//,'')}`,{waitUntil:'domcontentloaded'});
    await run(page);
    const observed=await page.evaluate(()=>window.__v5StorageKeyEvents);
    const operations=new Map();
    for(const event of observed){
      const key=event.key;
      if(!operations.has(key))operations.set(key,new Set());
      operations.get(key).add(event.operation);
    }
    const keys=[...operations].map(([key,actions])=>({key,operations:[...actions].sort(),cloudEligible:isSyncableStorageKey(key),
      recordId:legacyWorkspaceRecordId(key)}));
    for(const expectation of expected){
      assert.ok(keys.some(row=>expectation.key.test(row.key)&&row.operations.includes(expectation.operation)),
        `${source} must exercise ${expectation.operation} for ${expectation.key}`);
    }
    scenarios.push({source,fixture:'isolated synthetic browser profile; external network blocked',keys});
  }finally{await context.close();}
}
try{
  browser=await chromium.launch({headless:true,channel:process.env.JACKYUN_BROWSER_CHANNEL??'msedge'});
  await sample('public/EM.html',async page=>{
    await page.waitForFunction(()=>typeof upd==='function'&&typeof chk==='function');
    await page.evaluate(()=>{
      upd('Algebra audit fixture',3);
      chk('Algebra audit fixture',true);
      document.getElementById('block-start').value='16:00';
      document.getElementById('block-end').value='16:30';
      addBlock();
      document.getElementById('temp-name').value='Synthetic revision task';
      document.getElementById('temp-time').value='10';
      addTemp();
      finishIelts(STATE.dateStr);
    });
  });
  await sample('public/Pomodoro.html',async page=>{
    await page.waitForFunction(()=>['2026-09','2026-10'].every(month=>window.__v5StorageKeyEvents.some(event=>
      event.operation==='setItem'&&event.key===`jackyun_pomodoro_history_${month}`)));
  },{jackyun_pomodoro_workspace_v1:{tasks:[],settings:{soundEnabled:false,notificationsEnabled:false},sessions:[
    {id:'fixture-september',completedAt:'2026-09-12T12:00:00Z',durationSeconds:60},
    {id:'fixture-october',completedAt:'2026-10-12T12:00:00Z',durationSeconds:60},
  ]}});
  await sample('public/TimetableHub.html',async page=>{
    await page.waitForFunction(()=>typeof pushControlSync==='function'&&typeof saveNow==='function');
    await page.evaluate(()=>{
      saveNow(false);pushControlSync();
      aiPending={changes:[{ok:true,task:'synthetic preview'}]};
      persistAiPreview();clearAiPreview();
    });
  },{},[
    {key:/^th2_ai_preview_.+/,operation:'setItem'},
    {key:/^th2_ai_preview_.+/,operation:'removeItem'},
    {key:/^th2_plans.+/,operation:'setItem'},
    {key:/^jack_timetable_plan_.+/,operation:'setItem'},
  ]);
  await sample('public/Studyplan.html',async page=>{
    await page.waitForFunction(()=>typeof selectTrafficColor==='function'&&typeof getTrafficStatus==='function');
    await page.evaluate(()=>{
      selectTrafficColor('Mathematics','Synthetic audit unit','#34a853');
      const saved=getTrafficStatus('Mathematics','Synthetic audit unit');
      if(saved?.color!=='green')throw Error('traffic writer/reader round-trip failed');
      selectTrafficColor('Mathematics','Synthetic audit unit','#ea4335');
      if(getTrafficStatus('Mathematics','Synthetic audit unit')?.color!=='red')throw Error('traffic update failed');
    });
  },{},[{key:/^jackyun_traffic_Mathematics\|Synthetic audit unit$/,operation:'setItem'}]);
  const matrix=JSON.parse(await readFile('docs/sync-v5-coverage-matrix-20261026.json','utf8'));
  const dynamic=matrix.inventory_rows.filter(row=>row.key_or_pattern.includes('${dynamic}'));
  const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const coverage=dynamic.map(row=>{
    const pattern=new RegExp('^'+row.key_or_pattern.split('${dynamic}').map(escape).join('.+')+'$');
    const observed=scenarios.filter(scenario=>row.source_files.includes(scenario.source)).flatMap(scenario=>scenario.keys).filter(key=>pattern.test(key.key));
    return {pattern:row.key_or_pattern,cloudEligible:row.should_cloud_sync===true||row.should_cloud_sync==='yes',sources:row.source_files,observedKeys:observed.map(row=>row.key),
      writeObserved:observed.some(row=>row.operations.includes('setItem')),readObserved:observed.some(row=>row.operations.includes('getItem')),
      deleteObserved:observed.some(row=>row.operations.includes('removeItem')),
      status:observed.some(row=>row.operations.includes('setItem'))?'synthetic-browser-writer-observed':observed.length?'synthetic-browser-reader-observed':'pending'};
  });
  const unmapped=scenarios.flatMap(scenario=>scenario.keys.filter(key=>key.cloudEligible&&!key.recordId).map(key=>({source:scenario.source,key:key.key})));
  const report={capturedAt:new Date().toISOString(),environment:'isolated local browser',authenticatedAccount:false,
    learningValuesExported:false,scenarios,coverage,unmapped,productionWritesPerformed:false};
  await writeFile('docs/sync-v5-dynamic-runtime-20261027.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({scenarios:scenarios.length,cloudEligiblePatterns:coverage.filter(row=>row.cloudEligible).length,
    pendingCloudEligiblePatterns:coverage.filter(row=>row.cloudEligible&&row.status==='pending').length,
    dynamicWritersObserved:coverage.filter(row=>row.writeObserved).length,
    dynamicReadersOnly:coverage.filter(row=>row.readObserved&&!row.writeObserved).length,pending:coverage.filter(row=>row.status==='pending').length,unmapped}));
  assert.deepEqual(unmapped,[],'observed cloud-eligible keys need an explicit resource mapping');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
