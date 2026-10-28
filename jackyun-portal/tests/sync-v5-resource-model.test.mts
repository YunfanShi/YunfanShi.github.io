import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {resourcesToSchedule,resourceMap,scheduleToResources,mergeScheduleResources,legacyWorkspaceFieldForKey,legacyWorkspaceKeyFromRecordId,legacyWorkspaceRecordId,resourceScopeForRecordId,resourceTargetsForStorageKeys,SYNC_V5_SCHEDULE_SCOPES,workspaceStorageToResources} from '../src/lib/sync/resource-model.ts';
import {resourceFieldsForPath} from '../src/lib/sync/resource-engine.ts';

test('Schedule fields round-trip as scoped records with stable entity identifiers',()=>{
  const input={schemaVersion:1,timetable:{version:1,courses:[]},manualTasks:[{id:'task-1',title:'Review'}],
    completions:{'task-1':{completedAt:'2026-10-25T00:00:00Z'}},cues:[{id:'cue-1',prompt:'A'},{id:'cue-2',prompt:'B'}],
    cueMemos:[{cueId:'cue-1',content:'memo',updatedAt:'2026-10-25'}],practiceSessions:[{id:'focus-1',questions:[{id:'question-1',result:'completed',firstAttempt:'incorrect',retest:'correct'}]}],settings:{mode:'term'},
    customField:{retained:true}};
  const resources=scheduleToResources(input);
  assert.deepEqual(resourcesToSchedule(resources),input);
  assert.ok(resources.some(row=>row.scope==='cue'&&row.recordId==='cues:cue-1'));
  assert.ok(resources.some(row=>row.scope==='learning'&&row.recordId==='manualTasks:task-1'));
  assert.ok(resources.some(row=>row.scope==='timer'&&row.recordId==='practiceSessions:focus-1'));
  assert.deepEqual(resources.find(row=>row.scope==='timer'&&row.recordId==='practiceSessions:focus-1')?.value,input.practiceSessions[0],'question-level answer results must remain inside their stable session resource');
});

test('Schedule import history, learning progress, and question-bank data are explicit v5 round-trips',()=>{
  const importedAt='2026-10-28T08:30:00.000Z';
  const importRecord={id:'import-1',at:importedAt,source:'import',createdCount:1,modifiedCount:0,deletedCount:0,changes:[{cueId:'cue-imported',action:'create',subjectName:'Physics',unit:'Waves',prompt:'Define wave',fields:[]}]};
  const studyDraft={id:'draft-1',task:{key:'course-review:physics'},cueIds:['cue-imported'],index:0,assessments:{},startedAt:importedAt,updatedAt:importedAt};
  const schedule={
    schemaVersion:1,importedAt,timetable:{version:1,name:'Imported timetable',courses:[]},
    cueChangeHistory:[importRecord],cueCollectionUpdates:[{id:'batch-1',subjectId:'physics',subjectName:'Physics',updatedAt:importedAt,nextReminderDate:'2026-11-04',createdCount:1,modifiedCount:0,totalCueCount:1}],
    learningRecords:[{id:'record-1',subjectId:'physics',status:'stable',studiedAt:importedAt}],
    reviewProgress:{physics:{subjectId:'physics',intervalDays:3,nextReviewDate:'2026-10-31',updatedAt:importedAt}},
    cueReviews:[{id:'review-1',cueId:'cue-imported',status:'stable',reviewedAt:importedAt}],
    cueStudyDrafts:{physics:studyDraft},cueStudyDraft:studyDraft,
  };
  const resources=scheduleToResources(schedule);
  assert.deepEqual(resourcesToSchedule(resources),schedule);
  for(const [field,scope] of [['cueChangeHistory','cue'],['cueCollectionUpdates','cue'],['learningRecords','learning'],['reviewProgress','learning'],['cueReviews','cue'],['cueStudyDrafts','cue'],['importedAt','settings']] as const){
    assert.ok(resources.some(row=>row.field===field&&row.scope===scope),`${field} must have a v5 record`);
  }
  const pageTargets=resourceFieldsForPath('/schedule');
  for(const field of ['cueChangeHistory','cueCollectionUpdates','learningRecords','reviewProgress','cueReviews','cueStudyDrafts','importedAt']){
    assert.ok(pageTargets.some(row=>row.field===field),`Schedule page must subscribe to ${field}`);
  }
  assert.equal(legacyWorkspaceFieldForKey('jackyun_schedule_questions_v1'),'legacyLearning','the independent question bank is included in the Schedule page workspace subscription');
  assert.ok(pageTargets.some(row=>row.scope==='workspace'&&row.field==='legacyLearning'));
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

test('unknown root fields update and delete in the v4 compatibility projection',()=>{
  const base={schemaVersion:1,featureGate:{enabled:false},retiredField:'old'};
  const updated=scheduleToResources({schemaVersion:1,featureGate:{enabled:true}});
  assert.deepEqual(mergeScheduleResources(base,updated,['__root']),{schemaVersion:1,featureGate:{enabled:true}});
  const deleted=updated.filter(resource=>resource.recordId!=='__root:value');
  assert.deepEqual(mergeScheduleResources(base,deleted,['__root']),{schemaVersion:1});
});

test('legacy workspace values map to stable per-key v5 records and keep page domains separate',()=>{
  const rows=[
    {key:'jackyun_ielts_writing_draft_v1',value:'{"draft":"text"}'},
    {key:'jack_timetable_plan_2026-10-26',value:'{"tasks":[]}'},
    {key:'jackyun_theme',value:'"dark"'},
  ];
  const resources=workspaceStorageToResources(rows);
  assert.equal(resources.length,2);
  assert.deepEqual(resources.map(row=>row.field),['legacyTimetable','legacySettings']);
  assert.deepEqual(resources.map(row=>row.value),[{tasks:[]},'dark']);
  for(const row of resources){
    assert.equal(resourceScopeForRecordId(row.recordId),'workspace');
    assert.equal(legacyWorkspaceRecordId(legacyWorkspaceKeyFromRecordId(row.recordId)!),row.recordId);
  }
  assert.equal(new Set(resources.map(row=>row.recordId)).size,2);
});

test('workspace key mapping excludes credentials and keeps deletions as tombstone candidates',()=>{
  assert.equal(legacyWorkspaceFieldForKey('jackyun_schedule_control_v1'),null);
  assert.equal(legacyWorkspaceFieldForKey('jackyun-ai-config'),null);
  assert.equal(legacyWorkspaceFieldForKey('llm_key'),null);
  assert.equal(legacyWorkspaceFieldForKey('ds_key'),null);
  assert.equal(legacyWorkspaceFieldForKey('auth_refresh_token'),null);
  assert.equal(legacyWorkspaceFieldForKey('user_defined_unclassified_state_v1'),null,'unclassified business keys must stay outside v5 until assigned to a domain');
  assert.equal(legacyWorkspaceKeyFromRecordId('legacyMisc:dXNlcl9kZWZpbmVkX3Vua25vd24'),null,'the retired catch-all domain must not accept arbitrary records');
  assert.equal(legacyWorkspaceFieldForKey('user_defined_unclassified_state_v1'),null,'unclassified business keys must stay outside v5 until assigned to a domain');
  const [deleted]=workspaceStorageToResources([{key:'jackyun_theme',value:null}]);
  assert.equal(deleted.deleted,true);
  assert.equal(deleted.value,null);
  assert.equal(legacyWorkspaceKeyFromRecordId('legacySettings:../../unsafe'),null);
});

test('IELTS, QuizWise, personal sites and study-plan keys have explicit v5 workspace domains',()=>{
  assert.equal(legacyWorkspaceFieldForKey('jackyun_ielts_goal_v1'),'legacyIELTS');
  assert.equal(legacyWorkspaceFieldForKey('jackyun_ielts_writing_workspaces_v1'),'writingEssays');
  assert.equal(legacyWorkspaceFieldForKey('jackyun_ielts_writing_error_history_v1'),'writingErrorHistory');
  assert.equal(legacyWorkspaceFieldForKey('jackyun_ielts_writing_archive_v1'),'writingArchive');
  assert.equal(legacyWorkspaceFieldForKey('jackyun_ielts_reading_library_v1'),'legacyIELTS');
  for(const key of ['quizwise_current_questions','quizwise_history','quizwise_selected_subject'])
    assert.equal(legacyWorkspaceFieldForKey(key),'legacyQuiz',key);
  assert.equal(legacyWorkspaceFieldForKey('jackyun_personal_site_v1:9b775b2b-8a3f-4a6d-b2c7-0f8a89e14c31'),'legacyPersonalSites');
  assert.equal(legacyWorkspaceFieldForKey('jackyun_personal_site_v1:not-an-id'),null);
  for(const key of ['caie_schedule_current','caie_progress_v2_1','studyguide_progress'])
    assert.equal(legacyWorkspaceFieldForKey(key),'legacyStudyPlan',key);
  for(const key of ['jackyun_goal_data','gt_v6'])assert.equal(legacyWorkspaceFieldForKey(key),'legacyGoals',key);
  assert.equal(legacyWorkspaceFieldForKey('th2_plansplan-42'),'legacyTimetable');
  assert.equal(legacyWorkspaceFieldForKey('quizwise_ai_command'),null,'navigation commands are not durable learning data');
});

test('legacy timetable, goal, quiz, media and preference keys map to the page domain that owns them',()=>{
  assert.equal(legacyWorkspaceFieldForKey('th2_day_range'),'legacyTimetable');
  assert.equal(legacyWorkspaceFieldForKey('gt_v6'),'legacyGoals');
  assert.equal(legacyWorkspaceFieldForKey('warden_gt_sync'),'legacyGoals');
  assert.equal(legacyWorkspaceFieldForKey('mock_portal_config_v1'),'legacyExam');
  assert.equal(legacyWorkspaceFieldForKey('qw_history'),'legacyQuiz');
  assert.equal(legacyWorkspaceFieldForKey('gt_timers_v1'),'legacyTimer');
  assert.equal(legacyWorkspaceFieldForKey('mps_role'),'legacyMedia');
  assert.equal(legacyWorkspaceFieldForKey('ai_provider'),'legacySettings');
});
test('remaining dynamic study and practice keys have explicit cloud ownership',()=>{
  for(const key of ['temp_2026-10-26','blocks_2026-10-26','check_2026-10-26_Algebra','prog_2026-10-26_Physics','warden_sch_plan_mon'])
    assert.equal(legacyWorkspaceFieldForKey(key),'legacyStudyPlan',key);
  assert.equal(legacyWorkspaceFieldForKey('ielts_2026-10-26'),'legacyStudyPlan');
  for(const key of ['jackyun_traffic_Math|Unit1','jackyun_schedule_questions_v1','jackyun-site-tasks:site-1:block-1','warden_chat_v23','jack_chat_history'])
    assert.equal(legacyWorkspaceFieldForKey(key),'legacyLearning',key);
  assert.equal(legacyWorkspaceFieldForKey('jackyun_practice_recovery_session-1'),'legacyPractice');
  for(const key of ['jackyun-ai-pro-model','jackyun-ai-safety-mode','jackyun_hide_homepage_ai','jack_lang_chat','warden_gacha_cfg'])
    assert.equal(legacyWorkspaceFieldForKey(key),'legacySettings',key);
  assert.equal(legacyWorkspaceFieldForKey('warden_ai_daily_target'),'legacyGoals');
});
test('dynamic key families keep stable per-key v5 identities across goal, timer and learning namespaces',()=>{
  for(const key of ['gt_v5','gt_v4','gt_v3','goals','warden_ai_daily_target'])
    assert.equal(legacyWorkspaceFieldForKey(key),'legacyGoals',key);
  const october='jackyun_pomodoro_history_2026-10',november='jackyun_pomodoro_history_2026-11';
  assert.equal(legacyWorkspaceFieldForKey(october),'legacyTimer');
  assert.equal(legacyWorkspaceFieldForKey(november),'legacyTimer');
  assert.notEqual(legacyWorkspaceRecordId(october),legacyWorkspaceRecordId(november),'each month is an independent durable partition');
  for(const key of ['temp_2026-10-27','blocks_2026-10-27','check_2026-10-27_Algebra','prog_2026-10-27_Physics','ielts_2026-10-27'])
    assert.equal(legacyWorkspaceFieldForKey(key),'legacyStudyPlan',key);
  const traffic=['jackyun_traffic_Math|Unit1','jackyun_traffic_Physics|Forces'];
  assert.deepEqual(traffic.map(legacyWorkspaceFieldForKey),['legacyLearning','legacyLearning']);
  assert.notEqual(legacyWorkspaceRecordId(traffic[0]),legacyWorkspaceRecordId(traffic[1]),'prefix-enumerated traffic records retain distinct key identity');
});

test('every concrete legacy inventory key has an explicit v5 record mapping',()=>{
  const matrix=JSON.parse(readFileSync(new URL('../docs/sync-v5-coverage-matrix-20261028.json',import.meta.url),'utf8')) as {inventory_rows:Array<{key_or_pattern:string;should_cloud_sync:unknown;current_protocol:string}>};
  const candidates=matrix.inventory_rows.filter(row=>row.should_cloud_sync===true&&/v2|v4/.test(row.current_protocol));
  const concrete=candidates.filter(row=>!row.key_or_pattern.startsWith('?')&&!row.key_or_pattern.includes(String.fromCharCode(36)));
  const schedule=concrete.filter(row=>row.key_or_pattern==='jackyun_schedule_control_v1');
  assert.equal(candidates.length,189,'inventory candidate count is intentionally reviewed when the scanner changes');
  assert.equal(concrete.length,171,'all static key names must be classified, not left as runtime guesses');
  assert.equal(schedule.length,1);
  assert.deepEqual([...new Set(resourceTargetsForStorageKeys([schedule[0].key_or_pattern]).map(target=>target.scope))].sort(),[...SYNC_V5_SCHEDULE_SCOPES].sort());
  const workspace=concrete.filter(row=>row.key_or_pattern!=='jackyun_schedule_control_v1');
  assert.equal(workspace.length,170);
  for(const row of workspace){
    const field=legacyWorkspaceFieldForKey(row.key_or_pattern);
    assert.ok(field,`missing v5 owner field for ${row.key_or_pattern}`);
    const recordId=legacyWorkspaceRecordId(row.key_or_pattern);
    assert.ok(recordId,`missing stable v5 record ID for ${row.key_or_pattern}`);
    assert.equal(legacyWorkspaceKeyFromRecordId(recordId),row.key_or_pattern);
    assert.equal(resourceScopeForRecordId(recordId),'workspace');
  }
  const dynamic=candidates.filter(row=>row.key_or_pattern.startsWith('?')||row.key_or_pattern.includes(String.fromCharCode(36)));
  assert.equal(dynamic.length,18,'dynamic key templates remain explicit migration work');
  for(const row of dynamic){
    const sampleKey=row.key_or_pattern.replace(/\$\{dynamic\}/g,'sample');
    const field=legacyWorkspaceFieldForKey(sampleKey);
    assert.ok(field,`missing v5 owner for dynamic family ${row.key_or_pattern} (${sampleKey})`);
    const recordId=legacyWorkspaceRecordId(sampleKey);
    assert.ok(recordId,`missing stable v5 record ID for ${sampleKey}`);
    assert.equal(legacyWorkspaceKeyFromRecordId(recordId),sampleKey);
    assert.equal(resourceScopeForRecordId(recordId),'workspace');
  }
  assert.equal(candidates.length-concrete.length,dynamic.length,'all non-concrete rows are explicitly sampled dynamic families');
});

test('device controls, browser-tab state and user-script configuration are excluded from cloud sync',()=>{
  for(const key of ['sync_position','sync_isInput','sme_v30_hijack','sme_v30_autoclose','jy_tr3000_profile_mac','jackyun-browser-ai-conversation-target','jackyun-browser-ai-recent-choice:openai:gpt','jackyun-savepoint-conversation-1','jackyun-continue-conversation-1'])
    assert.equal(legacyWorkspaceFieldForKey(key),null,key);
  for(const key of ['jackyun_novel_position_v2:book-1','jackyun:seiue-course-review:v1:account-1'])
    assert.equal(legacyWorkspaceFieldForKey(key),null,key);
});
