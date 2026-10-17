import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { applyPracticeSession, validateSession, type PracticeSession } from '../src/lib/learning/practice-timer.ts';
import { createEmptyScheduleState } from '../src/lib/learning/schedule-control.ts';
import { readScheduleState } from '../src/lib/learning/workspace-reader.ts';
import { NAVIGATION_ITEMS, navigationIdFromPath } from '../src/lib/navigation.ts';
const context: any={structuredClone,crypto:webcrypto};
runInNewContext(readFileSync('public/practice-engine.js','utf8'),context);
const E=context.PracticeEngine;
function session(section='writing'): PracticeSession {return {id:'ielts',date:'2026-10-17',subject:'IELTS '+section,presetFamily:'ielts',ieltsSection:section as PracticeSession['ieltsSection'],source:'C',independent:true,scope:'Cambridge practice',mode:'exam',index:0,updatedAt:0,finished:false,questions:E.ieltsParts(section).map((t:any,i:number)=>E.question(i,t,'exam'))};}
test('practice timer is a direct learning navigation item with an active route',()=>{
 assert.equal(NAVIGATION_ITEMS.find(i=>i.href==='/practice-timer')?.group,'learning');assert.equal(navigationIdFromPath('/practice-timer'),'practice-timer');
});
test('IELTS allocations are fixed in every mode with one continuous listening timer',()=>{
 for(const [section,minutes] of Object.entries({listening:[32],reading:[20,20,20],writing:[20,40],speaking:[5,4,5]})){
  for(const mode of ['exam','normal','relaxed']) assert.deepEqual(Array.from(E.ieltsParts(section),(t:any)=>t.seconds[mode]),minutes.map(m=>m*60));
 }
 const s=session('listening');s.questions[0].startedAt=0;assert.match(E.ieltsPhase(s,1799999),/作答/);assert.match(E.ieltsPhase(s,1800000),/最后 2 分钟/);assert.match(E.ieltsPhase(s,1920000),/已结束/);
 const speaking=session('speaking');speaking.index=1;speaking.questions[1].startedAt=0;assert.match(E.ieltsPhase(speaking,59999),/准备/);assert.match(E.ieltsPhase(speaking,60000),/陈述/);assert.match(E.ieltsPhase(speaking,180000),/追问/);
});
test('correcting a running or paused question preserves identity, time, notes and first outcome',()=>{
 let s=session();delete s.ieltsSection;s.presetFamily='physics';s.questions=[E.question(0,E.presets('Physics')[0],'exam')];s.questions[0].node='waves';s.questions[0].firstAttempt={result:'wrong',elapsedMs:500,limitSeconds:100,blocked:false};
 s=E.toggle(s,1000);const old=structuredClone(s);const t={id:'short',name:'Short',seconds:{exam:10}};
 s=E.changeType(s,t,21000);assert.equal(s.questions[0].id,old.questions[0].id);assert.equal(s.questions[0].elapsedMs,20000);assert.equal(s.questions[0].startedAt,21000);assert.equal(s.questions[0].node,'waves');assert.deepEqual(s.questions[0].firstAttempt,old.questions[0].firstAttempt);assert.equal(E.color(s.questions[0],21000),'overtime');assert.equal(old.questions[0].elapsedMs,0);
 s=E.toggle(s,22000);s=E.changeType(s,E.presets('Physics')[1],100000);assert.equal(s.questions[0].elapsedMs,21000);assert.equal(s.questions[0].startedAt,null);assert.equal(E.report(s,200000).totalMs,21000);
 s.finished=true;assert.deepEqual(E.changeType(s,t,300000),s);
});
test('IELTS part switching, storage reload, completion and validation preserve each part',()=>{
 let s=session();s=E.toggle(s,0);s=E.switchQuestion(s,1,10000);s=E.toggle(s,30000);assert.equal(E.report(s,50000).totalMs,30000);s=E.switchQuestion(s,0,50000);assert.equal(s.questions[0].elapsedMs,10000);assert.equal(s.questions[1].elapsedMs,20000);
 let state=applyPracticeSession(createEmptyScheduleState(),s);const loaded=readScheduleState({getItem:()=>JSON.stringify(state)}).practiceSessions![0];assert.equal(loaded.ieltsSection,'writing');assert.equal(loaded.questions[1].limitSeconds,2400);
 s.finished=true;s.questions.forEach(q=>q.result='correct');s.updatedAt++;state=applyPracticeSession(state,s);assert.equal(state.timedPracticeRecords?.[0].subject,'IELTS writing');assert.equal(state.timedPracticeRecords?.[0].minutes,.5);
 assert.throws(()=>validateSession({...s,ieltsSection:'invalid'}));assert.throws(()=>validateSession({...s,presetFamily:'physics'}));
});
