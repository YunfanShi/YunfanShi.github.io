import assert from 'node:assert/strict';
import test from 'node:test';
import {resourcesToSchedule,resourceMap,scheduleToResources} from '../src/lib/sync/resource-model.ts';

test('Schedule fields round-trip as scoped records with stable entity identifiers',()=>{
  const input={schemaVersion:1,timetable:{version:1,courses:[]},manualTasks:[{id:'task-1',title:'Review'}],
    completions:{'task-1':{completedAt:'2026-10-25T00:00:00Z'}},cues:[{id:'cue-1',prompt:'A'},{id:'cue-2',prompt:'B'}],
    cueMemos:[{cueId:'cue-1',content:'memo',updatedAt:'2026-10-25'}],practiceSessions:[{id:'focus-1'}],settings:{mode:'term'},
    customField:{retained:true}};
  const resources=scheduleToResources(input);
  assert.deepEqual(resourcesToSchedule(resources),input);
  assert.ok(resources.some(row=>row.scope==='cue'&&row.recordId==='cues:cue-1'));
  assert.ok(resources.some(row=>row.scope==='learning'&&row.recordId==='manualTasks:task-1'));
  assert.ok(resources.some(row=>row.scope==='timer'&&row.recordId==='practiceSessions:focus-1'));
});

test('editing one CUE changes one record while preserving the collection order resource',()=>{
  const before=scheduleToResources({cues:[{id:'one',prompt:'A'},{id:'two',prompt:'B'}]});
  const after=scheduleToResources({cues:[{id:'one',prompt:'A'},{id:'two',prompt:'Changed'}]});
  const oldMap=resourceMap(before),newMap=resourceMap(after);
  const changed=[...new Set([...oldMap.keys(),...newMap.keys()])].filter(key=>JSON.stringify(oldMap.get(key))!==JSON.stringify(newMap.get(key)));
  assert.deepEqual(changed,['cue\0cues:two']);
});

test('duplicate stable entity IDs refuse resource conversion',()=>{
  assert.throws(()=>scheduleToResources({cues:[{id:'duplicate'},{id:'duplicate'}]}),/重复 ID/);
});
