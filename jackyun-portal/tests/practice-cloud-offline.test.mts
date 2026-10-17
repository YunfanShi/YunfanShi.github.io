import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
function harness(){let handler:(body:any)=>any=()=>{throw Error('offline')};const lost:string[]=[],statuses:string[]=[],calls:any[]=[];const q={id:'q',elapsedMs:0,startedAt:1};const session={id:'session',finished:false,index:0,questions:[q]};const context:any={crypto,AbortSignal,Date,setInterval:()=>1,clearInterval:()=>{},fetch:async(_url:string,init:any)=>{const body=init?.body?JSON.parse(init.body):null;calls.push(body);const result=handler(body);return new Response(JSON.stringify(result.data??result),{status:result.status??200});}};runInNewContext(readFileSync('public/practice-cloud.js','utf8'),context);const cloud=new context.PracticeCloud({capture:()=>({session}),status:(s:string)=>statuses.push(s),lost:(s:string)=>lost.push(s),available:()=>{}});cloud.mode='cloud';cloud.token='token';cloud.revision=1;return{cloud,q,session,lost,statuses,calls,setHandler:(fn:(body:any)=>any)=>{handler=fn;}};}
test('network errors and expired local deadlines preserve clock ownership',async()=>{const h=harness();h.cloud.deadline=1;await h.cloud.touch();assert.equal(h.cloud.token,'token');assert.equal(h.cloud.offline,true);h.cloud.minute();h.q.elapsedMs=61000;h.cloud.minute();await h.cloud.chain;assert.deepEqual(h.lost,[]);assert.equal(h.statuses.at(-1),'');});
test('reconnect automatically uploads the latest local elapsed time',async()=>{const h=harness();await h.cloud.touch();h.q.elapsedMs=123456;h.setHandler(()=>({ownerId:h.cloud.owner,revision:2,savedAt:new Date().toISOString()}));await h.cloud.touch();await h.cloud.chain;const save=h.calls.find(c=>c?.action==='save');assert.equal(save.payload.session.questions[0].elapsedMs,123456);assert.equal(h.cloud.offline,false);assert.equal(h.cloud.token,'token');assert.deepEqual(h.lost,[]);});
test('a lost acknowledgement revision is recovered without exiting or force claiming',async()=>{const h=harness();let count=0;h.setHandler(body=>!body?{ownerId:h.cloud.owner,revision:9}:++count===1?{status:409,data:{conflict:'STALE_REVISION'}}:{ownerId:h.cloud.owner,revision:10,savedAt:new Date().toISOString()});await h.cloud.persist();assert.equal(h.cloud.revision,10);assert.equal(h.calls.at(-1).revision,9);assert.deepEqual(h.lost,[]);assert.equal(h.calls.some(c=>c?.action==='claim'),false);});
test('only an explicit server takeover conflict exits the timer',async()=>{const h=harness();h.setHandler(()=>({status:503,data:{error:'temporarily unavailable'}}));await h.cloud.persist();assert.equal(h.cloud.token,'token');h.setHandler(()=>({status:409,data:{conflict:'LOST_CONTROL'}}));await h.cloud.touch();assert.equal(h.cloud.token,null);assert.equal(h.lost.length,1);});
test('a finished offline session is uploaded before deferred release',async()=>{const h=harness();h.session.finished=true;await h.cloud.persist();await h.cloud.release();assert.equal(h.cloud.token,'token');assert.equal(h.cloud.releasePending,true);h.setHandler(()=>({ownerId:h.cloud.owner,revision:2,savedAt:new Date().toISOString()}));await h.cloud.touch();await h.cloud.chain;await new Promise(r=>setTimeout(r,0));assert.equal(h.cloud.token,null);assert.deepEqual(h.calls.filter(c=>c?.action).slice(-3).map(c=>c.action),['touch','save','release']);});

test('cold offline start never waits for discovery and silently permits local practice',async()=>{
 const h=harness();h.cloud.token=null;h.cloud.mode='loading';h.cloud.initialized=new Promise(()=>{});
 assert.equal(await h.cloud.claim('new-session'),null);assert.equal(h.cloud.localSessionId,'new-session');assert.equal(h.calls.length,0);
 h.cloud.mode='unavailable';assert.equal(await h.cloud.claim('second'),null);
});
test('an occupied cloud draft permits local practice without overwriting or releasing it',async()=>{
 const h=harness();h.cloud.token=null;assert.equal(await h.cloud.claim('new'),null);assert.equal(h.cloud.mode,'unavailable');
 h.cloud.mode='cloud';h.setHandler(()=>({status:409,data:{conflict:'ACTIVE_SESSION'}}));assert.equal(await h.cloud.claim('new'),null);assert.equal(h.cloud.token,null);assert.equal(h.cloud.localSessionId,'new');await h.cloud.persist();await h.cloud.release();assert.equal(h.calls.some(c=>c?.action==='save'||c?.action==='release'),false);
});
test('tokenless recovery never claims another device or overwrites its payload',async()=>{
 const h=harness();h.cloud.token=null;h.cloud.localSessionId='local';h.setHandler(()=>({ownerId:'other',hasSession:true,revision:3,payload:{session:{id:'remote'}}}));
 await h.cloud.touch();assert.equal(h.calls.some(c=>c?.action==='claim'),false);assert.equal(h.cloud.token,null);
});
test('tokenless local start reconnects and saves only when cloud is empty',async()=>{
 const h=harness();h.cloud.token=null;h.cloud.localSessionId='session';h.setHandler(body=>!body?{}:body.action==='claim'?{token:'new-token',revision:1}:{revision:2});
 await h.cloud.touch();assert.equal(h.cloud.token,'new-token');assert.ok(h.calls.some(c=>c?.action==='save'));
});

test('cached remote sessions are not repeatedly downloaded by tokenless polling',async()=>{
 const h=harness();h.cloud.token=null;h.cloud.localSessionId='local';h.cloud.latest={revision:4,payload:{session:{id:'remote'}}};h.setHandler(()=>({ownerId:'other',hasSession:true,revision:4}));
 await h.cloud.touch();await h.cloud.touch();assert.equal(h.calls.length,2);assert.equal(h.cloud.latest.payload.session.id,'remote');
});

test('unknown claim conflicts remain visible to the caller',async()=>{
 const h=harness();h.cloud.token=null;h.setHandler(()=>({status:409,data:{conflict:'UNKNOWN_CONFLICT'}}));await assert.rejects(()=>h.cloud.claim('new'));
});
