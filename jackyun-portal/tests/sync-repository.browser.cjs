/* eslint @typescript-eslint/no-require-imports: off -- this browser harness is intentionally CommonJS. */
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const ts=require('typescript');
const packages=process.env.JACKYUN_ARTIFACT_PACKAGES||'C:/Users/syf26/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=require(path.join(packages,'playwright'));
const names=['src/lib/local-workspace.ts','src/lib/offline/workspace.ts','src/lib/request-timeout.ts',...['repository','outbox','local-data','hash','batch','acknowledgment','merge','scheduler','session-transport','pause','resource-model','writing-resource-model','writing-outbox'].map(n=>'src/lib/sync/'+n+'.ts')];
const modules=Object.fromEntries(names.map(name=>[name,ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText]));
const loader=`const sources=${JSON.stringify(modules)},cache={};function load(name,from=''){let id=name.startsWith('@/')?'src/'+name.slice(2):name.startsWith('.')?from.slice(0,from.lastIndexOf('/')+1)+name:name;const stack=[];for(const part of id.split('/')){if(part==='..')stack.pop();else if(part&&part!=='.')stack.push(part);}id=stack.join('/');if(!sources[id])id+='.ts';if(cache[id])return cache[id].exports;if(!sources[id])throw Error('Missing module '+id);const module={exports:{}};cache[id]=module;new Function('module','exports','require',sources[id])(module,module.exports,n=>load(n,id));return module.exports;}window.repository=load('src/lib/sync/repository.ts');window.store=load('src/lib/sync/outbox.ts');`;
(async()=>{
 const server=http.createServer((_request,response)=>{response.writeHead(200,{'Content-Type':'text/html'});response.end('<html><body><script>'+loader.replaceAll('</script','<\\/script')+'</script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.JACKYUN_BROWSER_EXECUTABLE_PATH?{executablePath:process.env.JACKYUN_BROWSER_EXECUTABLE_PATH}:{channel:process.env.JACKYUN_BROWSER_CHANNEL||'msedge'})});
 try{
  const context=await browser.newContext(),a=await context.newPage(),b=await context.newPage(),url=`http://127.0.0.1:${server.address().port}`;
  await a.goto(url);await a.evaluate(()=>window.repository.initializeRepository('browser-alice'));
  const reactive=await a.evaluate(async()=>{
    const events=[];const stop=window.repository.workspaceStorage.subscribe('reactive-fixture',()=>events.push({value:window.repository.workspaceStorage.getSnapshot('reactive-fixture'),state:window.repository.workspaceStorage.getSaveStatus('reactive-fixture')}));
    window.repository.workspaceStorage.setItem('reactive-fixture','draft');
    const immediate={events:[...events],state:window.repository.workspaceStorage.getSaveStatus('reactive-fixture')};
    await window.repository.flushLocalWrites();
    const committed={events:[...events],state:window.repository.workspaceStorage.getSaveStatus('reactive-fixture')};stop();return {immediate,committed};
  });
  assert.deepEqual(reactive.immediate.events,[{value:'draft',state:'saving'}]);assert.equal(reactive.immediate.state,'saving');
  assert.ok(reactive.committed.events.length>=2);assert.equal(reactive.committed.state,'saved');
  const restore=await a.evaluate(async()=>{
    const key='jackyun_schedule_control_v1',storage=window.repository.workspaceStorage;
    storage.setItem(key,JSON.stringify({before:true}));await storage.flush();
    let source='';const eventName=load('src/lib/local-workspace.ts').CLOUD_STATE_APPLIED_EVENT;
    const onChange=event=>{if(event.detail?.keys?.includes(key))source=event.detail.source??'';};window.addEventListener(eventName,onChange);
    const value={restored:true},canonical=load('src/lib/sync/hash.ts').canonicalJson(value);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
    const contentHash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    await window.repository.restoreRepositoryRecord(key,async()=>({key,value,revision:9,contentHash,deleted:false,updatedAt:new Date().toISOString()}));
    window.removeEventListener(eventName,onChange);
    return {value:storage.getItem(key),source,operations:(await window.store.getOutbox()).filter(row=>row.key===key),status:storage.getSaveStatus(key),archive:await window.store.getSetting(`legacyCloudArchive:v1:${key}`)};
  });
  assert.equal(restore.value,'{"restored":true}');assert.equal(restore.source,'restore');assert.equal(restore.operations.length,0);
  assert.equal(restore.status,'saved');assert.equal(restore.archive.operations.length,1);
  await a.evaluate(async()=>{window.repository.workspaceStorage.setItem('study','{"a":0,"b":0}');await window.repository.flushLocalWrites();});
  await b.goto(url);await b.evaluate(()=>window.repository.initializeRepository('browser-alice'));
  await Promise.all([
   a.evaluate(async()=>{window.repository.workspaceStorage.setItem('study','{"a":1,"b":0}');await window.repository.flushLocalWrites();}),
   b.evaluate(async()=>{window.repository.workspaceStorage.setItem('study','{"a":0,"b":2}');await window.repository.flushLocalWrites();}),
  ]);
  const saved=await a.evaluate(()=>window.store.getDocuments());assert.deepEqual(JSON.parse(saved.find(r=>r.key==='study').value),{a:1,b:2});
  await b.close();await a.reload();await a.evaluate(()=>window.repository.initializeRepository('browser-alice'));
  assert.deepEqual(JSON.parse(await a.evaluate(()=>window.repository.workspaceStorage.getItem('study'))),{a:1,b:2});
  const queue=await a.evaluate(()=>window.store.getOutbox());assert.equal(queue.filter(row=>row.key==='study').length,1);
  // Simulate a legacy iframe/native write just before a browser reload.
  await a.evaluate(()=>localStorage.setItem('study','{"a":1,"b":3}'));
  await a.reload();await a.evaluate(()=>window.repository.initializeRepository('browser-alice'));
  assert.deepEqual(JSON.parse(await a.evaluate(()=>window.repository.workspaceStorage.getItem('study'))),{a:1,b:3});
  // Native stale source from an older app must never prevent page initialization.
  await a.addInitScript(()=>localStorage.setItem('study','{"a":99,"b":99}'));
  await a.reload();await a.evaluate(()=>window.repository.initializeRepository('browser-alice'));
  assert.deepEqual(JSON.parse(await a.evaluate(()=>window.repository.workspaceStorage.getItem('study'))),{a:1,b:3});
  await a.evaluate(()=>window.repository.migrateLegacyStorage());
  assert.deepEqual(JSON.parse(await a.evaluate(()=>window.repository.workspaceStorage.getItem('study'))),{a:1,b:3});
  const recovery=await a.evaluate(async()=>{const rows=await load('src/lib/sync/local-data.ts').readLocalData();return rows.filter(row=>row.key.startsWith('jackyun_migration_conflict_v1:')).map(row=>JSON.parse(row.value));});
  assert.ok(recovery.some(row=>row.sourceKey==='study'&&row.value==='{"a":99,"b":99}'));
  await a.evaluate(()=>window.repository.initializeRepository('browser-bob'));
  assert.equal(await a.evaluate(()=>window.repository.workspaceStorage.getItem('study')),null);
  await a.evaluate(()=>window.repository.initializeRepository('browser-alice'));
  assert.deepEqual(JSON.parse(await a.evaluate(()=>window.repository.workspaceStorage.getItem('study'))),{a:1,b:3});
  await a.evaluate(async()=>{
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
    const offline=load('src/lib/offline/workspace.ts');
    await offline.runOfflineMutation('browser-alice','task.create',{title:'durable'},{operationId:'11111111-1111-4111-8111-111111111111',snapshot:{scope:'tasks',value:{inboxTasks:[{id:'11111111-1111-4111-8111-111111111111',title:'durable'}]}}});
  });
  const atomic=await a.evaluate(async()=>{const offline=load('src/lib/offline/workspace.ts');return {snapshot:await offline.readOfflineSnapshot('browser-alice','tasks'),operations:await offline.listOfflineMutations('browser-alice')};});
  assert.equal(atomic.snapshot.inboxTasks[0].id,atomic.operations[0].id);
  assert.equal(await a.evaluate(()=>load('src/lib/offline/workspace.ts').saveRemoteSnapshot('browser-alice','tasks',{inboxTasks:[]})),false);
  const aborted=await a.evaluate(async()=>{
    const offline=load('src/lib/offline/workspace.ts'),original=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name==='jackyun-offline-workspace'&&this.name==='outbox')throw new DOMException('quota','QuotaExceededError');return original.apply(this,args);};
    let rejected=false;try{await offline.runOfflineMutation('browser-alice','task.create',{title:'unsaved'},{snapshot:{scope:'tasks',value:{inboxTasks:[]}}});}catch{rejected=true;}finally{IDBObjectStore.prototype.put=original;}
    return {rejected,snapshot:await offline.readOfflineSnapshot('browser-alice','tasks'),operations:await offline.listOfflineMutations('browser-alice')};
  });
  assert.equal(aborted.rejected,true);assert.equal(aborted.snapshot.inboxTasks.length,1);assert.equal(aborted.operations.length,1);
  await a.evaluate(async()=>{
    window.repository.workspaceStorage.setItem('study','{"a":4,"b":3}');
    await window.repository.initializeRepository('browser-bob');
    await window.repository.flushLocalWrites();
  });
  assert.equal(await a.evaluate(()=>window.repository.workspaceStorage.getItem('study')),null);
  await a.evaluate(()=>window.repository.initializeRepository('browser-alice'));
  assert.deepEqual(JSON.parse(await a.evaluate(()=>window.repository.workspaceStorage.getItem('study'))),{a:4,b:3});
  const frameSource=fs.readFileSync('src/components/modules/legacy-frame.tsx','utf8');
  const frameTemplate=frameSource.match(/const interceptScript = `([\s\S]*?)`;/)[1];
  const frameScript=new Function('languageRef','return `'+frameTemplate+'`;')({current:'zh'}).replace(/<\/?script>/g,'');
  assert.ok(!frameScript.includes('workspaceStorage'),'iframe scripts cannot reference parent module variables');
  const iframeErrors=[];a.on('pageerror',error=>iframeErrors.push(error.message));
  await a.addScriptTag({content:frameScript});assert.deepEqual(iframeErrors,[]);
  await a.evaluate(async()=>{localStorage.setItem('countdown_fixture','{"verified":true}');window.repository.captureLegacyStorageEdit('countdown_fixture');await window.repository.flushLocalWrites();});
  assert.equal((await a.evaluate(()=>window.store.getDocuments())).find(r=>r.key==='countdown_fixture').value,'{"verified":true}');
  assert.ok((await a.evaluate(()=>window.store.getOutbox())).some(r=>r.key==='countdown_fixture'));
  const countdown=await context.newPage();await countdown.goto(url);
  await countdown.setContent(fs.readFileSync('public/Countdown.html','utf8').replace(/<script[^>]*src=[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link[^>]*>/gi,''),{waitUntil:'domcontentloaded'});
  await countdown.getByRole('button',{name:'⚙️',exact:true}).click();
  await countdown.getByRole('textbox',{name:'Event Name (e.g. My Birthday)',exact:true}).fill('unfinished draft');
  await countdown.evaluate(()=>{localStorage.setItem('jack_countdown_events',JSON.stringify([{id:'cloud-test',title:'Cloud item',date:'2026-12-31T12:00',color:'#4285f4'}]));window.dispatchEvent(new StorageEvent('storage',{key:'jack_countdown_events',storageArea:localStorage}));});
  assert.equal(await countdown.getByRole('button',{name:'Cloud item',exact:true}).count(),1);
  assert.equal(await countdown.getByRole('textbox',{name:'Event Name (e.g. My Birthday)',exact:true}).inputValue(),'unfinished draft');
  await countdown.close();
  const output={passed:14,cases:['stale native source is skipped at startup and manual import retains current content plus a recoverable copy','same-tab repository subscription sees a draft before IndexedDB commit and reports save state','schedule restore commits the new projection, archives obsolete legacy intent and emits a targeted restore event','two-tab independent merge','browser reload retains local data and intent','legacy-write crash recovery','account projection isolation','original account restoration','business snapshot and operation atomic commit','business quota abort retains prior snapshot','account switch drains pending writes without circular initialization','legacy iframe injection executes without parent module references','legacy edit message atomically captures a new key and intent','countdown cloud redraw preserves unfinished form'],realAccount:false};
  fs.mkdirSync('.migration-private',{recursive:true});fs.writeFileSync('.migration-private/sync-repository-browser.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
