import assert from 'node:assert/strict';
import test from 'node:test';
import {resourcesToSchedule,resourceMap,scheduleToResources,mergeScheduleResources,legacyWorkspaceFieldForKey,legacyWorkspaceKeyFromRecordId,legacyWorkspaceRecordId,resourceScopeForRecordId,workspaceStorageToResources} from '../src/lib/sync/resource-model.ts';

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
test('device controls, browser-tab state and user-script configuration are excluded from cloud sync',()=>{
  for(const key of ['sync_position','sync_isInput','sme_v30_hijack','sme_v30_autoclose','jy_tr3000_profile_mac','jackyun-browser-ai-conversation-target','jackyun-browser-ai-recent-choice:openai:gpt','jackyun-savepoint-conversation-1','jackyun-continue-conversation-1'])
    assert.equal(legacyWorkspaceFieldForKey(key),null,key);
  for(const key of ['jackyun_novel_position_v2:book-1','jackyun:seiue-course-review:v1:account-1'])
    assert.equal(legacyWorkspaceFieldForKey(key),null,key);
});
