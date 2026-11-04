import assert from 'node:assert/strict';
import test from 'node:test';
import {createLocalShare,latestDataChange,parseLocalShare} from '../src/lib/backup/local-share.ts';
import {localPageReplacementDeletes} from '../src/lib/backup/local-import.ts';

test('local share records selected page identity and content timestamps, independent of export time',()=>{
  const file=createLocalShare({
    jackyun_schedule_control_v1:JSON.stringify({practiceSessions:[{completedAt:'2026-10-31T10:00:00Z'},{completedAt:'2026-11-01T11:00:00Z'}]}),
    jackyun_settings_v1:JSON.stringify({updatedAt:'2026-11-01T12:00:00Z'}),
  },['schedule'],new Date('2026-11-01T12:30:00Z'));
  assert.equal(file.pages.length,1);
  assert.equal(file.pages[0].page,'schedule');
  assert.equal(file.pages[0].dataChangedAt,'2026-11-01T11:00:00.000Z');
  assert.equal(file.exportedAt,'2026-11-01T12:30:00.000Z');
  assert.equal(parseLocalShare(JSON.stringify(file)).pages[0].page,'schedule');
});

test('legacy pages without content timestamps are labeled unknown, not with import or export time',()=>{
  assert.equal(latestDataChange({jackyun_definition_v1:'{"term":"cell"}'}),null);
});

test('local share import rejects a key assigned to a different page',()=>{
  const file=createLocalShare({jackyun_schedule_control_v1:'{"cues":[{"id":"c"}]}',['LexiFlowPro_words']:'[]'},['schedule']);
  const invalid={...file,pages:[{...file.pages[0],values:{...file.pages[0].values,LexiFlowPro_words:'[]'}}]};
  assert.throws(()=>parseLocalShare(JSON.stringify(invalid)),/不是该页面允许分享的数据/);
});

test('new exports include local-only CUE drafts and old bundles route them to Study',()=>{
  const key='jackyun_cue_answer_draft_v1:["study-session_1","cue-2"]';
  const current=createLocalShare({[key]:'{"text":"draft"}'},['study']);
  assert.equal(current.pages[0].values[key],'{"text":"draft"}');
  const old={...current,pages:[{...current.pages[0],page:'other' as const,label:'其他已同步页面数据',values:{[key]:'{"text":"old draft"}'}}]};
  const migrated=parseLocalShare(JSON.stringify(old));
  assert.equal(migrated.pages.find(row=>row.page==='study')?.values[key],'{"text":"old draft"}');
  assert.equal(migrated.pages.some(row=>row.page==='other'&&Object.hasOwn(row.values,key)),false);
});

test('replacement removes omitted keys only from selected pages',()=>{
  const current={jackyun_schedule_control_v1:'{"cues":[{"id":"old"}]}',jackyun_definition_v1:'{"term":"keep"}'};
  assert.deepEqual(localPageReplacementDeletes('schedule',current,{jackyun_schedule_control_v1:'{"cues":[{"id":"new"}]}'}),[]);
  assert.deepEqual(localPageReplacementDeletes('schedule',current,{}),['jackyun_schedule_control_v1']);
  assert.deepEqual(localPageReplacementDeletes('definitions',current,{}),['jackyun_definition_v1']);
});
