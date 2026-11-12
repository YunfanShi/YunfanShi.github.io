import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyScheduleState,parseCueBulkImport,applyCueBulkOperations,recordCueStudyAssessment,type StudyCue} from '../src/lib/learning/schedule-control.ts';
import {cueContentSignature} from '../src/lib/learning/learning-assistance.ts';
import {parseCueDeepUnderstanding,validateCueTrainingEvidence} from '../src/lib/learning/cue-understanding.ts';
import {createCueExchangeBundle,parseCueExchangeBundle,cueExchangeChangedFields} from '../src/lib/learning/cue-exchange.ts';
import {cueExportOperations} from '../src/lib/learning/study-prompts.ts';
import {readCueManagerEditorDraft,writeCueManagerEditorDraft} from '../src/lib/learning/cue-editor-draft.ts';
import {scheduleToResources,resourcesToSchedule} from '../src/lib/sync/resource-model.ts';
const now='2026-11-12T02:00:00Z';
const cue:StudyCue={id:'force',subjectId:'physics',subjectName:'Physics',unit:'Forces',subsection:'',prompt:'Define resultant force',answer:'Vector sum of forces',type:'definition',markingPoints:[],createdAt:now,updatedAt:now,intervalDays:2,easeFactor:2.5,streak:1,status:'stable'};
const deep={gap:'Pythagoras used for non-perpendicular forces',conditions:{question:'When can Pythagoras be used?',answer:'Only when the vector components are perpendicular.'}};
test('optional deep content preserves legacy signatures and updates only edited content',()=>{
 const legacy=JSON.stringify([cue.subjectName,cue.unit,cue.type,cue.prompt,cue.subtitle,cue.answer,cue.choices,cue.correctChoice,cue.markingPoints]);
 assert.equal(cueContentSignature(cue),legacy);assert.equal(cueContentSignature({...cue,deepUnderstanding:{}}),legacy);
 const ops=parseCueBulkImport({operations:[{action:'update',id:cue.id,deepUnderstanding:deep}]}).operations;
 const [updated]=applyCueBulkOperations([cue],ops,()=>{throw Error('unexpected create')},now);
 assert.deepEqual(updated.deepUnderstanding,deep);assert.notEqual(cueContentSignature(updated),legacy);assert.equal(updated.status,'stable');assert.equal(updated.intervalDays,2);
 assert.equal(applyCueBulkOperations([updated],ops,()=>{throw Error('unexpected create')},now)[0],updated,'identical nested content must not create another revision');
});
test('deep content survives both exports, partial editor drafts and scoped V5 roundtrip',()=>{
 const rich={...cue,deepUnderstanding:deep};
 assert.deepEqual(cueExportOperations([rich])[0].deepUnderstanding,deep);
 assert.deepEqual(parseCueExchangeBundle(JSON.stringify(createCueExchangeBundle([rich]))).cues[0].deepUnderstanding,deep);
 assert.deepEqual(cueExchangeChangedFields(cue,rich),['deepUnderstanding']);
 const store=new Map<string,string>();const storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);}};
 const partial={gap:'Working on the conditions',principle:{question:'Why?',answer:''}};
 writeCueManagerEditorDraft(storage,{subjectName:'Physics',unit:'Forces',subsection:'',editingId:cue.id,prompt:cue.prompt,subtitle:'',answer:cue.answer??'',type:'definition',display:'standard',choices:'',correctChoice:0,markingPoints:'',deepUnderstanding:partial});
 assert.deepEqual(readCueManagerEditorDraft(storage)?.deepUnderstanding,partial);
 const state={...createEmptyScheduleState(),cues:[rich]};assert.deepEqual(resourcesToSchedule(scheduleToResources(state)).cues,[rich]);
});
test('saved dimensions require a question and explanation; malformed hints cannot masquerade as evidence',()=>{
 assert.throws(()=>parseCueDeepUnderstanding({principle:{question:'Why?',answer:''}}));
 assert.throws(()=>parseCueDeepUnderstanding({conditions:'answer'}));
 assert.deepEqual(parseCueDeepUnderstanding({principle:{question:'',answer:''}}),{});
 assert.throws(()=>validateCueTrainingEvidence({hints:[{id:'x',level:5 as 1,at:now}]}));
 assert.throws(()=>validateCueTrainingEvidence({hints:[{id:'x',level:1,at:now},{id:'x',level:2,at:now}]}));
});
test('per-session prompt evidence persists without changing the existing rating policy or erasing previous sessions',()=>{
 let state={...createEmptyScheduleState(),cues:[cue]};
 state=recordCueStudyAssessment(state,{cueId:cue.id,status:'partial',training:{sessionId:'one',bottleneck:'conditions',hints:[{id:'hint',level:1,at:now}]}},new Date(now),'same-task');
 state=recordCueStudyAssessment(state,{cueId:cue.id,status:'stable',training:{sessionId:'two',independentMode:true,hints:[]}},new Date('2026-11-12T03:00:00Z'),'same-task');
 assert.equal(state.cueReviews.length,1);assert.equal(state.cueReviews[0].trainingSessions?.one.hints?.length,1);assert.deepEqual(state.cueReviews[0].trainingSessions?.two.hints,[]);
 assert.equal(state.cueReviews[0].sameDayWeak,true);assert.equal(state.cues[0].intervalDays,1);
 assert.deepEqual(resourcesToSchedule(scheduleToResources(state)).cueReviews,state.cueReviews);
});
