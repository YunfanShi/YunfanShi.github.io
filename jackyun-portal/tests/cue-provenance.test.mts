import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCueSourceFields} from '../src/lib/learning/cue-source.ts';
import {applyCueBulkOperations, completeLearningSession, createEmptyScheduleState, parseCueBulkImport, saveCueStudyDraft, type StudyCue, type CueStudyDraft, type LearningTask} from '../src/lib/learning/schedule-control.ts';
import {createCueExchangeBundle, parseCueExchangeBundle, cueExchangeChangedFields} from '../src/lib/learning/cue-exchange.ts';
import {cueExportOperations} from '../src/lib/learning/study-prompts.ts';
import {readCueManagerEditorDraft, writeCueManagerEditorDraft} from '../src/lib/learning/cue-editor-draft.ts';
const now='2026-11-11T02:00:00Z';
const cue:StudyCue={id:'a',subjectId:'physics',subjectName:'Physics',unit:'Forces',subsection:'',prompt:'Define force',answer:'Rate of change of momentum',type:'definition',markingPoints:[],version:2,status:'partial',intervalDays:2,easeFactor:2.5,streak:0,createdAt:now,updatedAt:now};
const metadata={sourceKind:'book',source:'Cambridge Physics · 3rd edition',sourceLocation:'Chapter 3 · P42 · Q5',sourceUrl:'https://example.com/book',examStatus:'tested' as const,examHistory:'CAIE 9702 · 2025 May/June · Paper 22 · Q3(b)'};

test('precise source and exam evidence survive bulk update and both export formats',()=>{
 const operations=parseCueBulkImport({version:1,operations:[{action:'update',id:cue.id,...metadata}]}).operations;
 const [updated]=applyCueBulkOperations([cue],operations,()=>{throw Error('must not create')},now);
 assert.deepEqual(parseCueSourceFields(updated as unknown as Record<string,unknown>),metadata);
 assert.equal(updated.status,cue.status);assert.equal(updated.intervalDays,cue.intervalDays);
 assert.deepEqual(parseCueSourceFields(cueExportOperations([updated])[0]),metadata);
 const bundle=parseCueExchangeBundle(JSON.stringify(createCueExchangeBundle([updated])));
 assert.deepEqual(parseCueSourceFields(bundle.cues[0] as unknown as Record<string,unknown>),metadata);
 assert.deepEqual(new Set(cueExchangeChangedFields(cue,updated)),new Set(Object.keys(metadata)));
 const clear=parseCueBulkImport({operations:[{action:'update',id:cue.id,source:'',sourceLocation:'',sourceUrl:'',examStatus:'unknown',examHistory:''}]}).operations;
 const [cleared]=applyCueBulkOperations([updated],clear,()=>{throw Error('must not create')},now);
 assert.equal(cleared.source,'');assert.equal(cleared.examHistory,'');assert.equal(cleared.examStatus,'unknown');
 const [unchanged]=applyCueBulkOperations([updated],parseCueBulkImport({operations:[{action:'update',id:cue.id,answer:'New answer'}]}).operations,()=>{throw Error()},now);
 assert.equal(unchanged.sourceLocation,metadata.sourceLocation);
});

test('create parser preserves ChatGPT provenance and rejects malformed sources and exam status',()=>{
 const parsed=parseCueBulkImport({operations:[{action:'create',unit:'Forces',prompt:'Question',...metadata,sourceKind:'ChatGPT',source:'Forces discussion',sourceLocation:'2026-11-11 · message 8'}]}).operations[0];
 assert.equal(parsed.sourceKind,'ChatGPT');assert.equal(parsed.sourceLocation,'2026-11-11 · message 8');
 for(const value of [{source:{}},{examStatus:true},{examStatus:{toString:()=> 'tested'}},{examStatus:'maybe'},{sourceUrl:'javascript:alert(1)'},{sourceUrl:'not a URL'},{sourceLocation:'x'.repeat(301)}])assert.throws(()=>parseCueSourceFields(value));
 assert.deepEqual(parseCueSourceFields({}),{});
 assert.deepEqual(parseCueSourceFields({source:undefined}),{});
});

test('source and exam fields survive editor draft restore including legacy drafts',()=>{
 let raw:string|null=null;const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;}};
 const draft={subjectName:'Physics',unit:'Forces',subsection:'',editingId:'a',prompt:'Question',subtitle:'',answer:'',type:'definition' as const,display:'standard' as const,choices:'',correctChoice:0,markingPoints:''};
 writeCueManagerEditorDraft(storage,{...draft,...metadata});assert.equal(readCueManagerEditorDraft(storage)?.examHistory,metadata.examHistory);
 writeCueManagerEditorDraft(storage,draft);assert.equal(readCueManagerEditorDraft(storage)?.prompt,'Question');
});

test('completion has stable identity, snapshots provenance and rejects late draft resurrection',()=>{
 const task={key:'study',title:'Study Physics',type:'study',date:'2026-11-11',durationMinutes:10,manual:true} as LearningTask;
 const draft={id:'session',task,cueIds:['a'],index:0,revealed:true,assessments:{a:'partial'},updatedAt:now} as CueStudyDraft;
 const state=saveCueStudyDraft({...createEmptyScheduleState(),cues:[{...cue,...metadata}]},draft);
 const evidence={sessionId:draft.id,cueIds:['a'],newCues:[],materials:[],assessments:[{cueId:'a',status:'partial' as const}],cueReviewsAlreadyRecorded:true};
 const completed=completeLearningSession(state,task,{studiedContent:'',issue:'',note:''},evidence,new Date(now));
 assert.equal(completed.learningRecords.length,1);
 assert.equal(completed.learningRecords[0].cues[0].examHistory,metadata.examHistory);
 assert.equal(saveCueStudyDraft(completed,{...draft,index:1}),completed);
 assert.equal(completeLearningSession(completed,task,{studiedContent:'',issue:'',note:''},evidence,new Date(now)),completed);
});
