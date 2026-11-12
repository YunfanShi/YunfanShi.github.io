import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateTrainingEvidence, TRAINING_POLICY, type PracticeTrainingEvidence } from '../src/lib/learning/independent-training.ts';
import { applyPracticeSession, validateSession, type PracticeSession } from '../src/lib/learning/practice-timer.ts';
import { independentTrainingSummary, independentTrainingFourWeeks } from '../src/lib/learning/practice-insights.ts';
import { createEmptyScheduleState } from '../src/lib/learning/schedule-control.ts';
import { scheduleToResources, resourcesToSchedule } from '../src/lib/sync/resource-model.ts';

const hint={id:'hint-1',level:4 as const,at:'2026-11-12T04:00:00Z'};
function session(training?:PracticeTrainingEvidence):PracticeSession {
  return {id:'physics-training',date:'2026-11-12',subject:'Physics',source:'B',independent:true,mode:'exam',scope:'Fixture new question',index:0,updatedAt:1,finished:true,questions:[{id:'q1',name:'Q1',typeId:'force',typeName:'Forces',limitSeconds:300,elapsedMs:360000,startedAt:null,result:'correct',blocked:false,node:'Forces',cause:'',retest:'',...(training?{training}:{})}]};
}
test('optional training evidence distinguishes unknown from explicitly zero hints and rejects invalid events',()=>{
  assert.deepEqual(validateTrainingEvidence({}),{});
  assert.deepEqual(validateTrainingEvidence({hints:[]}),{hints:[]});
  assert.throws(()=>validateTrainingEvidence({hints:[{...hint,level:5}]}));
  assert.throws(()=>validateTrainingEvidence({hints:[hint,hint]}));
  assert.throws(()=>validateTrainingEvidence({hints:[{...hint,at:'invalid'}]}));
  assert.throws(()=>validateTrainingEvidence({stuckMs:-1}));
  assert.throws(()=>validateSession({...session(),questions:[{...session().questions[0],training:{firstStep:'invented'}}]}));
});
test('first snapshot fixes training evidence and V5 preserves it without a new collection',()=>{
  const value=session({kind:'unfamiliar',firstStep:'yes',hints:[],stuckMs:30000,decision:'skip',lossCause:'time'});
  const state=applyPracticeSession(createEmptyScheduleState(),value);
  assert.deepEqual(state.practiceSessions![0].questions[0].firstAttempt?.training,value.questions[0].training);
  const edit=structuredClone(state.practiceSessions![0]);edit.updatedAt=2;edit.questions[0].training={kind:'basic',hints:[hint]};
  const updated=applyPracticeSession(state,edit);
  assert.deepEqual(updated.practiceSessions![0].questions[0].firstAttempt?.training,value.questions[0].training);
  assert.deepEqual(resourcesToSchedule(scheduleToResources(updated as unknown as Record<string,unknown>)).practiceSessions,updated.practiceSessions);
});
test('weekly metrics use unique first Physics unfamiliar questions and never timer summary counts twice',()=>{
  const value=session({kind:'unfamiliar',firstStep:'yes',hints:[],stuckMs:30000,decision:'skip',lossCause:'time'});
  const state=applyPracticeSession(createEmptyScheduleState(),value);
  state.practiceSessions!.push(structuredClone(state.practiceSessions![0]));
  let summary=independentTrainingSummary(state,'2026-11-12');
  assert.equal(summary.total,1);assert.equal(summary.independent,1);assert.equal(summary.knownHints,1);
  assert.equal(summary.firstStepYes,1);assert.equal(summary.overtime,1);assert.equal(summary.stuckMs,30000);assert.equal(summary.skips,1);assert.equal(summary.timeLoss,1);
  assert.equal(summary.start,'2026-11-09');assert.equal(summary.end,'2026-11-15');
  const assisted=applyPracticeSession(createEmptyScheduleState(),session({kind:'unfamiliar',hints:[hint]}));
  summary=independentTrainingSummary(assisted,'2026-11-12');assert.equal(summary.independent,0);assert.equal(summary.highestHint,4);assert.equal(summary.hintCount,1);
});
test('missing first evidence stays unknown after report edits; old/manual/familiar/mixed records do not imply mastery',()=>{
  const old=applyPracticeSession(createEmptyScheduleState(),session());
  old.practiceSessions![0].questions[0].training={kind:'unfamiliar',hints:[]};
  let summary=independentTrainingSummary(old,'2026-11-12');assert.equal(summary.unknownKind,1);assert.equal(summary.independent,0);
  const value=session({kind:'unfamiliar'});value.questions.push({...value.questions[0],id:'q2',subjectName:'Pure Math',presetFamily:'math',training:{kind:'unfamiliar',hints:[]}});
  const state=applyPracticeSession(createEmptyScheduleState(),value);
  summary=independentTrainingSummary(state,'2026-11-12');assert.equal(summary.total,1);assert.equal(summary.unknownHints,1);assert.equal(summary.knownHints,0);
  assert.equal(independentTrainingSummary(state,'2026-11-23').total,0);
});
test('training policy is opt-in and included in chat and agent prompts without automatic full-solution escalation',()=>{
  assert.match(TRAINING_POLICY,/完整解析必须由学生明确请求/);
  const fab=readFileSync(new URL('../src/components/modules/ai-chat-fab.tsx',import.meta.url),'utf8');
  assert.match(fab,/\[independentTraining, setIndependentTraining\] = useState\(false\)/);
  assert.equal((fab.match(/\$\{systemPromptSuffix\}\$\{trainingInstruction\}/g)||[]).length,2);
});

test('four-week trial starts on the first evidenced Monday, preserves empty weeks and excludes future evidence',()=>{
  assert.equal(independentTrainingFourWeeks(createEmptyScheduleState(),'2026-11-12').start,null);
  let state=applyPracticeSession(createEmptyScheduleState(),session({kind:'unfamiliar',hints:[]}));
  const later=session({kind:'unfamiliar',hints:[hint]});later.id='week-three';later.date='2026-11-23';state=applyPracticeSession(state,later);
  let trial=independentTrainingFourWeeks(state,'2026-11-12');
  assert.equal(trial.start,'2026-11-09');assert.equal(trial.weeks.length,4);assert.equal(trial.weeks[0].independent,1);assert.equal(trial.weeks[1].knownHints,0);assert.equal(trial.weeks[2].knownHints,0);
  trial=independentTrainingFourWeeks(state,'2026-11-24');assert.equal(trial.weeks[2].knownHints,1);assert.equal(trial.weeks[2].highestHint,4);
});
test('effective first steps include attempted ungraded questions while unknown remains outside the denominator',()=>{
  const value=session({kind:'unfamiliar',firstStep:'yes'});value.questions[0].result='pending';value.questions.push({...value.questions[0],id:'unknown',training:{kind:'unfamiliar'}});
  const summary=independentTrainingSummary(applyPracticeSession(createEmptyScheduleState(),value),'2026-11-12');
  assert.equal(summary.unfamiliar,2);assert.equal(summary.firstStepKnown,1);assert.equal(summary.firstStepYes,1);assert.equal(summary.graded,0);assert.equal(summary.knownHints,0);
});
