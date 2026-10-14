import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDidaTasks, didaTasksForDate, didaTaskTreeForDate, didaTaskContexts } from '../src/lib/integrations/dida-schedule.ts';
import { didaTaskVersion } from '../src/lib/integrations/dida-task-reference.ts';
import { harness } from './helpers/dida-schedule-harness.mts';
const rows = [
 {id:'parent',projectId:'p',title:'Exam preparation',status:0,startDate:'2026-10-15T00:00:00+0800',isAllDay:true,childIds:['child','later'],kind:'CHECKLIST',desc:'Prepare materials',items:[{id:'done',title:'Already finished',status:1},{id:'todo',title:'Print paper',status:0}]},
 {id:'child',projectId:'p',title:'Do paper',parentId:'parent',status:0,startDate:'2026-10-14T00:00:00+0800',isAllDay:true},
 {id:'later',projectId:'p',title:'Undated child',status:0},
 {id:'completed',projectId:'p',title:'Completed task',parentId:'parent',status:2},
];
test('normalization preserves nested task links and distinguishes checklist status',()=>{
 const tasks=normalizeDidaTasks(rows,'p');assert.equal(tasks[0].content,'Prepare materials');assert.equal(tasks[1].parentId,'parent');assert.deepEqual(tasks[0].items?.map(i=>i.completed),[true,false]);
 assert.notEqual(didaTaskVersion(rows[0],'p'),didaTaskVersion({...rows[0],items:[{id:'todo',title:'Print paper',status:1}]},'p'));
});
test('due child includes future parent as context without counting parent or undated future sibling',()=>{
 const tasks=normalizeDidaTasks(rows,'p');assert.deepEqual(didaTasksForDate(tasks,'2026-10-14').map(t=>t.id),['child']);
 const tree=didaTaskTreeForDate(tasks,'2026-10-14');assert.deepEqual(tree.map(i=>[i.task.id,i.depth,i.contextOnly]),[['parent',0,true],['child',1,false]]);
});
test('missing and completed ancestors do not hide unfinished children, cycles terminate',()=>{
 const tasks=normalizeDidaTasks([{id:'a',title:'A',projectId:'p',status:0,parentId:'b'},{id:'b',title:'B',projectId:'p',status:0,parentId:'a'},{id:'c',title:'C',projectId:'p',status:0,parentId:'missing'},{id:'done',title:'Done',projectId:'p',status:2},{id:'d',title:'D',projectId:'p',status:0,parentId:'done'}],'p');
 const tree=didaTaskTreeForDate(tasks,'2026-10-14');assert.deepEqual(new Set(tree.map(i=>i.task.id)),new Set(['a','b','c','d']));assert.equal(tree.length,4);
});
test('task links never cross lists and notes do not become actionable todos',()=>{
 const a=normalizeDidaTasks([{id:'root',title:'Root',projectId:'p',status:0,childIds:['child']},{id:'note',title:'Note',projectId:'p',status:0,kind:'NOTE'}],'p');
 const b=normalizeDidaTasks([{id:'child',title:'Other list',projectId:'q',parentId:'root',status:0}],'q');
 assert.equal(didaTaskContexts([...a,...b]).find(i=>i.task.id==='child')?.ancestors.length,0);
 assert.equal(didaTasksForDate(a,'2026-10-14').some(t=>t.id==='note'),false);
});
test('API excludes completed rows even when returned by active project endpoint',async()=>{
 const h=harness({rows});const result=await h.exports.GET(h.request('GET'));const data=await result.json();assert.equal(result.status,200);assert.equal(data.tasks.length,3);assert.equal(data.tasks.some((t:{completed:boolean})=>t.completed),false);assert.equal(h.calls.some(c=>c.path==='/task/completed'),false);
});
