import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers/dida-schedule-harness.mts';
const accountId='11111111-1111-4111-8111-111111111111';
test('sync requires authenticated owner and does not contact remote data on rejection',async()=>{
  const h=harness({signedIn:false});const response=await h.exports.GET(h.request('GET'));
  assert.equal(response.status,401);assert.equal(h.calls.length,0);
  const missing=harness({account:false});assert.equal((await missing.exports.GET(missing.request('GET'))).status,404);
});
test('GET reads selected lists and recently completed tasks; ownership filters cover secrets',async()=>{
  const h=harness();const response=await h.exports.GET(h.request('GET'));const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.tasks.length,2);assert.equal(data.tasks[1].completed,true);
  assert.ok(h.filters.some(([key,value])=>key==='user_id'&&value==='owner'));assert.ok(h.filters.some(([key,value])=>key==='account_id'&&value===accountId));
  assert.deepEqual(h.calls.find(call=>call.path==='/task/completed')?.body?.projectIds,['p']);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('PUT validates list ownership and preserves outbound project settings',async()=>{
  const h=harness();assert.equal((await h.exports.PUT(h.request('PUT',{projectIds:['alien']}))).status,400);
  assert.equal((await h.exports.PUT(h.request('PUT',{projectIds:['q','q']}))).status,200);
  assert.deepEqual(h.getSettings().syncProjectIds,['q']);assert.equal(h.getSettings().projectId,'send-default');
});
test('empty selected lists disable task polling without deleting the account',async()=>{
  const h=harness({selected:[]});const response=await h.exports.GET(h.request('GET'));assert.deepEqual((await response.json()).tasks,[]);assert.equal(h.calls.length,0);
});
test('PATCH completes exactly the selected task and checks the resulting remote status',async()=>{
  const h=harness();const response=await h.exports.PATCH(h.request('PATCH',{projectId:'p',taskId:'task',completed:true}));
  assert.equal(response.status,200);assert.equal((await response.json()).task.completed,true);
  assert.deepEqual(h.calls.map(call=>call.path),['/project/p/task/task','/project/p/task/task/complete','/project/p/task/task']);
});
test('PATCH can reopen a task without stripping content or recurring metadata',async()=>{
  const h=harness();h.task.status=2;
  const response=await h.exports.PATCH(h.request('PATCH',{projectId:'p',taskId:'task',completed:false}));
  assert.equal(response.status,200);assert.equal((await response.json()).task.completed,false);
  const update=h.calls.find(call=>call.path==='/task/batch')?.body?.update as Record<string,unknown>[];
  assert.equal(update[0].content,'Keep this');assert.equal(update[0].repeatFlag,'RRULE:FREQ=DAILY');assert.equal(update[0].status,0);
});
test('unselected projects and injected paths cannot trigger remote mutations',async()=>{
  const h=harness();assert.equal((await h.exports.PATCH(h.request('PATCH',{projectId:'q',taskId:'task',completed:true}))).status,403);
  assert.equal((await h.exports.PATCH(h.request('PATCH',{projectId:'p',taskId:'../task',completed:true}))).status,400);
  assert.equal(h.calls.length,0);
});
test('unconfirmed changes and remote errors never produce a successful checkbox response',async()=>{
  const h=harness({refuseChange:true});assert.equal((await h.exports.PATCH(h.request('PATCH',{projectId:'p',taskId:'task',completed:true}))).status,502);
  const failed=harness({error:true});const response=await failed.exports.GET(failed.request('GET'));assert.equal(response.status,502);assert.equal(JSON.stringify(await response.json()).includes('server-only-token'),false);
});
