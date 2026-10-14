import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyScheduleState } from '../src/lib/learning/schedule-control.ts';
import { emptyDiagnosis, saveDiagnosis, readDiagnoses, diagnosisFromPractice, appendDiagnosisEvent, diagnosisProgress, diagnosisRecommendations, transferCandidates, validateMarkingReview, markingSummary, planDiagnosisTransfer, type ExamDiagnosis, type MarkingReview } from '../src/lib/learning/exam-diagnosis.ts';
import { applyPracticeSession, firstPracticeOutcome, currentPracticeRecords, type PracticeSession } from '../src/lib/learning/practice-timer.ts';
import { readScheduleState } from '../src/lib/learning/workspace-reader.ts';
import { threeWayMerge } from '../src/lib/sync/merge.ts';
import { unsafeScheduleReplacement, scheduleHasContent } from '../src/lib/sync/schedule-safety.ts';
import { saveManualPractice, normalizePracticeFrequencies, planWeeklyTraining, weeklyTrainingCredit, weeklyPracticeSummary } from '../src/lib/learning/timed-practice.ts';
import { practiceBreakdowns, practiceWeaknessTrends } from '../src/lib/learning/practice-insights.ts';

const diagnosis = (patch:Partial<ExamDiagnosis>={}):ExamDiagnosis => ({...emptyDiagnosis('2026-10-15','d'), exam:'First Monthly Test',reference:'Q10',node:'Graph Sketching',causes:['interpretation','selection'],problem:'Find f(x) was read as find a tangent',target:'Choose integration, differentiation or tangent from the requested output', ...patch});
const session = (id='s', result:PracticeSession['questions'][number]['result']='wrong', patch:Partial<PracticeSession>={}):PracticeSession => ({id,date:'2026-10-15',subject:'Pure Math',scope:'Unseen set',source:'B',independent:true,mode:'exam',index:0,finished:true,updatedAt:1,questions:[{id:'q',name:id==='s'?'Q10':'Different unseen question',typeId:'math',typeName:'Sketching',limitSeconds:720,elapsedMs:600000,startedAt:null,result,blocked:false,node:'Graph Sketching',cause:'interpretation',retest:'Different unseen graph'}],...patch});
const review = (patch:Partial<MarkingReview>={}):MarkingReview => ({id:'review',date:'2026-10-15',score:4,maxMarks:6,source:'User supplied 9618 paper reference',rule:'Any four distinct points, maximum six',method:'manual',points:[{id:'p1',text:'Mechanism',marks:4,status:'achieved',evidence:'Equivalent expression'},{id:'p2',text:'Necessary condition',marks:2,status:'missing',evidence:'Not stated',cause:'expression'}],...patch});

test('A and B scenarios separate facts and potential causes and validate scores / dates',()=>{
  const state=saveDiagnosis(createEmptyScheduleState(),diagnosis());
  assert.equal(state.examDiagnoses![0].certainty,'potential');
  assert.equal(diagnosisRecommendations(state)[0].priority,1);
  const physics=diagnosis({id:'p',subject:'Physics',reference:'Q9',node:'Inclined Plane',causes:['reasoning'],problem:'Acceleration direction incorrect',target:'Distinguish velocity, net force and acceleration'});
  assert.equal(saveDiagnosis(state,physics).examDiagnoses!.length,2);
  for(const bad of [{date:'2026-02-31'},{score:7,maxMarks:6},{lostMarks:9,maxMarks:6},{causes:['unknown']}]) assert.throws(()=>saveDiagnosis(state,{...diagnosis(),...bad} as ExamDiagnosis));
  assert.throws(()=>readDiagnoses([diagnosis(),diagnosis()]));
});
test('original answers and source identities are immutable, manual correction appends review history',()=>{
  const d=diagnosis({originalAnswer:'My original wording',score:4,maxMarks:6,subject:'Computer Science',skill:'Explain Cause and Effect'});
  let state=saveDiagnosis(createEmptyScheduleState(),d);
  assert.throws(()=>saveDiagnosis(state,{...d,originalAnswer:'Changed'},d));
  state=saveDiagnosis(state,{...d,reviews:[review()]},d);
  const next=state.examDiagnoses![0];
  state=saveDiagnosis(state,{...next,reviews:[...next.reviews,review({id:'r2',score:5})]},next);
  assert.equal(state.examDiagnoses![0].originalAnswer,d.originalAnswer);
  assert.equal(state.examDiagnoses![0].reviews.length,2);
  assert.throws(()=>saveDiagnosis(state,{...next,reviews:[]},next));
  assert.equal(state.cues.length,0);
});
test('manual equivalent wording, uncertain points and capped alternatives never produce keyword grading',()=>{
  const r=review();assert.equal(markingSummary(r).pointScore,4);assert.equal(markingSummary(r).missing[0].cause,'expression');
  const alternatives=review({points:[{...r.points[0],marks:8},{...r.points[1],status:'uncertain'}]});
  assert.equal(markingSummary(alternatives).pointScore,6);assert.equal(markingSummary(alternatives).uncertain.length,1);
  assert.throws(()=>validateMarkingReview({...r,score:7}));assert.throws(()=>validateMarkingReview({...r,source:''}));
});
test('practice-linked creation avoids re-entry and first failure survives later correct marking',()=>{
  let state=applyPracticeSession(createEmptyScheduleState(),session());
  const d=diagnosisFromPractice(state,'s','q','d');assert.equal(d.sourceRecordId,'timer-s');assert.equal(d.causes[0],'interpretation');
  state=applyPracticeSession(state,session('s','correct',{updatedAt:2}));
  assert.equal(firstPracticeOutcome(state.practiceSessions![0].questions[0]).result,'wrong');
  assert.equal(weeklyPracticeSummary(state.timedPracticeRecords!,'2026-10-15').onTimeRate,0);
  assert.equal(practiceBreakdowns(state,'2026-10-15','new').subjects[0].failed,1);
  const corrupted=structuredClone(state.practiceSessions![0]);corrupted.questions[0].firstAttempt!.result='correct';corrupted.updatedAt=3;
  assert.throws(()=>applyPracticeSession(state,corrupted));
});
test('repair then new independent question validates transfer and retains recurrence timeline',()=>{
  let state=applyPracticeSession(createEmptyScheduleState(),session());
  let d=diagnosisFromPractice(state,'s','q','d');state=saveDiagnosis(state,d);
  state=applyPracticeSession(state,session('new','wrong'));
  const event={id:'e1',date:'2026-10-15',kind:'transfer' as const,note:'Different unseen graph confirms target',sessionId:'new',questionId:'q'};
  assert.throws(()=>appendDiagnosisEvent(state,d,event));
  state=appendDiagnosisEvent(state,d,{id:'repair',date:'2026-10-15',kind:'repair',note:'Explain endpoint, graph conditions and requested output'});d=state.examDiagnoses![0];
  assert.equal(diagnosisProgress(state,d).status,'awaiting-transfer');
  state=appendDiagnosisEvent(state,d,event);d=state.examDiagnoses![0];assert.equal(diagnosisProgress(state,d).status,'repair');
  assert.equal(diagnosisRecommendations(state)[0].priority,3);
  state=applyPracticeSession(state,session('new2','correct'));
  state=appendDiagnosisEvent(state,d,{...event,id:'e2',sessionId:'new2'});d=state.examDiagnoses![0];
  assert.equal(diagnosisProgress(state,d).status,'verified');assert.deepEqual(diagnosisProgress(state,d).transfers.map(t=>t.status),['repair','verified']);
  assert.equal(diagnosisRecommendations(state).length,0);
});
test('familiar repair, complete papers, assisted or original questions never qualify for transfer',()=>{
  let state=applyPracticeSession(createEmptyScheduleState(),session());const d=diagnosisFromPractice(state,'s','q','d');
  for(const s of [session('a','correct',{source:'A'}),session('c','correct',{source:'C'}),session('help','correct',{independent:false}),session('other','correct',{subject:'Physics'})]) state=applyPracticeSession(state,s);
  assert.equal(transferCandidates(state,d).length,0);
  assert.throws(()=>appendDiagnosisEvent(state,d,{id:'e',date:d.date,kind:'transfer',note:'invalid',sessionId:'a',questionId:'q'}));
});
test('CS full-score retest requires an actual marking review and uncertain points block verification',()=>{
  let state=applyPracticeSession(createEmptyScheduleState(),session('cs','correct',{subject:'Computer Science'}));
  let d=diagnosis({subject:'Computer Science',skill:'Explain Cause and Effect',events:[{id:'repair',date:'2026-10-15',kind:'repair',note:'Explain necessary condition'}]});state=saveDiagnosis(state,d);
  const event={id:'e',date:d.date,kind:'transfer' as const,note:'New scenario',sessionId:'cs',questionId:'q'};
  assert.throws(()=>appendDiagnosisEvent(state,d,event));
  state=appendDiagnosisEvent(state,d,{...event,review:review()});d=state.examDiagnoses![0];assert.equal(diagnosisProgress(state,d).status,'repair');
  state=applyPracticeSession(state,session('cs2','correct',{subject:'Computer Science'}));
  state=appendDiagnosisEvent(state,d,{...event,id:'e2',sessionId:'cs2',review:review({score:6,points:review().points.map(p=>({...p,status:'achieved'}))})});
  assert.equal(diagnosisProgress(state,state.examDiagnoses![0]).status,'verified');
});
test('correct overtime transfers are speed issues; planned transfer cannot precede repair/date',()=>{
  const slow=session('slow','correct');slow.questions[0].elapsedMs=721000;
  let state=applyPracticeSession(createEmptyScheduleState(),slow);const d=diagnosis({events:[{id:'repair',date:'2026-10-15',kind:'repair',note:'Repair'}]});state=saveDiagnosis(state,d);
  const e={id:'e',date:d.date,kind:'transfer' as const,note:'New graph',sessionId:'slow',questionId:'q'};
  state=appendDiagnosisEvent(state,d,e);assert.equal(diagnosisProgress(state,state.examDiagnoses![0]).status,'speed');
  assert.throws(()=>appendDiagnosisEvent(state,{...d,transferDate:'2026-10-16'},e));
});
test('legacy reload defaults, malformed diagnoses fail without silent removal and export round trip',()=>{
  const old=createEmptyScheduleState();assert.deepEqual(readScheduleState({getItem:()=>JSON.stringify(old)}).examDiagnoses,[]);
  const saved=saveDiagnosis(old,diagnosis());const loaded=readScheduleState({getItem:()=>JSON.stringify(saved)},new Date('2026-10-15T12:00:00'));
  assert.deepEqual(loaded.examDiagnoses,saved.examDiagnoses);assert.equal(loaded.practiceFrequencies!.find(f=>f.subject==='Computer Science')!.sessions,2);
  assert.throws(()=>readScheduleState({getItem:()=>JSON.stringify({...old,examDiagnoses:[{}]})}));assert.equal(scheduleHasContent({examDiagnoses:saved.examDiagnoses}),true);
});
test('independent device changes merge; conflicting same field edits fail and preserve remote',()=>{
  const d=diagnosis();const base=saveDiagnosis(createEmptyScheduleState(),d);
  const remote=saveDiagnosis(base,{...d,target:'Remote target'},d);
  const combined=saveDiagnosis(remote,{...d,problem:'Local fact'},d);
  assert.equal(combined.examDiagnoses![0].target,'Remote target');assert.equal(combined.examDiagnoses![0].problem,'Local fact');
  assert.throws(()=>saveDiagnosis(remote,{...d,target:'Local target'},d));assert.equal(remote.examDiagnoses![0].target,'Remote target');
  const independent=threeWayMerge(base,{...base,examDiagnoses:[d,diagnosis({id:'local'})]},{...base,examDiagnoses:[d,diagnosis({id:'remote'})]});assert.equal(independent.conflicts.length,0);
});
test('server safety rejects stale omissions or edited history even with a fresh sync revision',()=>{
  const state=applyPracticeSession(createEmptyScheduleState(),session());const before=saveDiagnosis(state,diagnosis({originalAnswer:'Original',reviews:[review()]}));
  assert.equal(unsafeScheduleReplacement(before,state),true);
  assert.equal(unsafeScheduleReplacement(before,{...before,examDiagnoses:[{...before.examDiagnoses![0],reviews:[]}]}),true);
  const after=structuredClone(before);delete after.practiceSessions![0].questions[0].firstAttempt;assert.equal(unsafeScheduleReplacement(before,after),true);
  const sorted=JSON.parse(JSON.stringify(before, Object.keys(before))); // compare normal serialized data separately
  assert.ok(sorted);assert.equal(unsafeScheduleReplacement(before,JSON.parse(JSON.stringify(before))),false);
});
test('only two recommendations, high confirmed knowledge loss can be prioritised and tasks are idempotent',()=>{
  let state=createEmptyScheduleState();for(let i=0;i<5;i++) state=saveDiagnosis(state,diagnosis({id:String(i),node:String(i)}));
  state=saveDiagnosis(state,diagnosis({id:'high',node:'Networks',certainty:'confirmed',causes:['knowledge'],score:2,maxMarks:6,transferDate:'2026-10-16',transferPlan:'Unseen Explain question'}));
  assert.equal(diagnosisRecommendations(state).length,2);assert.equal(diagnosisRecommendations(state)[0].diagnosis.id,'high');
  const d=state.examDiagnoses!.at(-1)!;const planned=planDiagnosisTransfer(state,d,'task');assert.equal(planDiagnosisTransfer(planned,d,'duplicate'),planned);
});
test('school homework credits configurable CS frequency, duplicate IDs do not inflate statistics',()=>{
  const frequencies=normalizePracticeFrequencies(undefined);assert.equal(frequencies.find(f=>f.subject==='Statistics')!.sessions,0);
  const cs=frequencies.find(f=>f.subject==='Computer Science')!;let state=applyPracticeSession(createEmptyScheduleState(),session('hw','correct',{subject:'Computer Science',source:'homework'}));
  state.practiceSessions![0].questions[0].elapsedMs=1200000;delete state.practiceSessions![0].questions[0].firstAttempt;state=applyPracticeSession(createEmptyScheduleState(),state.practiceSessions![0]);
  assert.equal(weeklyTrainingCredit(state,'2026-10-15',cs),1);
  const planned=planWeeklyTraining(state,'2026-10-15',cs,'second');assert.equal(planned.manualTasks.length,1);assert.equal(planWeeklyTraining(planned,'2026-10-15',cs,'duplicate'),planned);
  state.timedPracticeRecords!.push(state.timedPracticeRecords![0]);assert.equal(weeklyTrainingCredit(state,'2026-10-15',cs),1);assert.equal(practiceBreakdowns(state,'2026-10-15','new').subjects[0].attempted,1);
  assert.throws(()=>normalizePracticeFrequencies([{...cs,sessions:99}]));
});

test('manual summaries retain first results and correction history rather than overwriting a failed attempt',()=>{
  const record={id:'manual',date:'2026-10-15',subject:'Pure Math',source:'B' as const,reference:'Unseen homework',independent:true,minutes:25,onTime:0,overtime:0,failed:1,blocked:1,bottleneck:'interpretation'};
  let state=saveManualPractice(createEmptyScheduleState(),record);const base=state.timedPracticeRecords![0];state=saveManualPractice(state,{...base,onTime:1,failed:0,blocked:0},base);
  assert.equal(state.timedPracticeRecords![0].onTime,1);assert.equal(state.timedPracticeRecords![0].corrections!.length,1);assert.equal(weeklyPracticeSummary(state.timedPracticeRecords!,'2026-10-15').onTimeRate,0);
  assert.equal(unsafeScheduleReplacement(state,{...state,timedPracticeRecords:[record]}),true);
});

test('new / repair / mock scopes stay separate and graph errors show an improvement sequence',()=>{
  let state=createEmptyScheduleState();for(const [id,result,source] of [['first','wrong','B'],['second','wrong','B'],['third','correct','B'],['familiar','correct','A'],['mock','correct','C']] as const)state=applyPracticeSession(state,session(id,result,{source}));
  const trend=practiceWeaknessTrends(state)[0];assert.equal(trend.repeated,true);assert.deepEqual(trend.entries.map(e=>e.status),['repair','repair','verified']);
  assert.equal(weeklyPracticeSummary(state.timedPracticeRecords!,'2026-10-15','repair').attempted,1);assert.equal(practiceBreakdowns(state,'2026-10-15','mock').subjects[0].attempted,1);
});
test('old-client derived summaries cannot alter first-attempt metrics while question snapshots survive',()=>{
  const state=applyPracticeSession(createEmptyScheduleState(),session());state.timedPracticeRecords![0]={...state.timedPracticeRecords![0],onTime:1,failed:0};
  assert.equal(weeklyPracticeSummary(currentPracticeRecords(state),'2026-10-15').onTimeRate,0);
});

test('an initially empty answer can be completed later, then becomes immutable',()=>{
 const d=diagnosis();const state=saveDiagnosis(createEmptyScheduleState(),d);const filled=saveDiagnosis(state,{...d,originalAnswer:'First submitted answer'},d);assert.equal(unsafeScheduleReplacement(state,filled),false);assert.throws(()=>saveDiagnosis(filled,{...filled.examDiagnoses![0],originalAnswer:'Changed'},filled.examDiagnoses![0]));
});
