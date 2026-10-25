const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const ts=require('typescript');
const packages=process.env.JACKYUN_ARTIFACT_PACKAGES||'C:/Users/syf26/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=require(path.join(packages,'playwright'));
const names=['src/lib/local-workspace.ts','src/lib/offline/workspace.ts','src/lib/request-timeout.ts',...['repository','outbox','hash','batch','acknowledgment','merge','scheduler','session-transport'].map(n=>'src/lib/sync/'+n+'.ts')];
const modules=Object.fromEntries(names.map(name=>[name,ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText]));
const loader=`const sources=${JSON.stringify(modules)},cache={};function load(name,from=''){let id=name.startsWith('@/')?'src/'+name.slice(2):name.startsWith('.')?from.slice(0,from.lastIndexOf('/')+1)+name:name;const stack=[];for(const part of id.split('/')){if(part==='..')stack.pop();else if(part&&part!=='.')stack.push(part);}id=stack.join('/');if(!sources[id])id+='.ts';if(cache[id])return cache[id].exports;if(!sources[id])throw Error('Missing module '+id);const module={exports:{}};cache[id]=module;new Function('module','exports','require',sources[id])(module,module.exports,n=>load(n,id));return module.exports;}window.repository=load('src/lib/sync/repository.ts');window.store=load('src/lib/sync/outbox.ts');`;
(async()=>{
 const server=http.createServer((_request,response)=>{response.writeHead(200,{'Content-Type':'text/html'});response.end('<html><body><script>'+loader.replaceAll('</script','<\\/script')+'</script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext(),a=await context.newPage(),b=await context.newPage(),url=`http://127.0.0.1:${server.address().port}`;
  await a.goto(url);await a.evaluate(()=>window.repository.initializeRepository('browser-alice'));
  await a.evaluate(async()=>{window.repository.workspaceStorage.setItem('study','{"a":0,"b":0}');await window.repository.flushLocalWrites();});
  await b.goto(url);await b.evaluate(()=>window.repository.initializeRepository('browser-alice'));
  await Promise.all([
   a.evaluate(async()=>{window.repository.workspaceStorage.setItem('study','{"a":1,"b":0}');await window.repository.flushLocalWrites();}),
   b.evaluate(async()=>{window.repository.workspaceStorage.setItem('study','{"a":0,"b":2}');await window.repository.flushLocalWrites();}),
  ]);
  const saved=await a.evaluate(()=>window.store.getDocuments());assert.deepEqual(JSON.parse(saved.find(r=>r.key==='study').value),{a:1,b:2});
  await b.close();await a.reload();await a.evaluate(()=>window.repository.initializeRepository('browser-alice'));
  assert.deepEqual(JSON.parse(await a.evaluate(()=>window.repository.workspaceStorage.getItem('study'))),{a:1,b:2});
  const queue=await a.evaluate(()=>window.store.getOutbox());assert.equal(queue.length,1);
  // Simulate a legacy iframe/native write just before a browser reload.
  await a.evaluate(()=>localStorage.setItem('study','{"a":1,"b":3}'));
  await a.reload();await a.evaluate(()=>window.repository.initializeRepository('browser-alice'));
  assert.deepEqual(JSON.parse(await a.evaluate(()=>window.repository.workspaceStorage.getItem('study'))),{a:1,b:3});
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
  const output={passed:10,cases:['two-tab independent merge','browser reload retains local data and intent','legacy-write crash recovery','account projection isolation','original account restoration','business snapshot and operation atomic commit','business quota abort retains prior snapshot','account switch drains pending writes without circular initialization','legacy iframe injection executes without parent module references','legacy edit message atomically captures a new key and intent'],realAccount:false};
  fs.mkdirSync('.migration-private',{recursive:true});fs.writeFileSync('.migration-private/sync-repository-browser.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
