import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { validateSession, applyPracticeSession, type PracticeSession } from '../src/lib/learning/practice-timer.ts';
import { createEmptyScheduleState } from '../src/lib/learning/schedule-control.ts';
import { readScheduleState } from '../src/lib/learning/workspace-reader.ts';
const context:Record<string,unknown>={structuredClone,crypto:webcrypto,TextEncoder};
runInNewContext(readFileSync(new URL('../public/practice-engine.js',import.meta.url),'utf8'),context);
const E=context.PracticeEngine as {parseImport:(text:string)=>unknown;importedSession:(data:unknown,now:number)=>PracticeSession;settle:(session:PracticeSession,now:number)=>PracticeSession};
const data={format:'jackyun-practice-v1',title:'Forces',subject:'Mechanics',questions:[{name:'Q1',type:'受力图',text:'画出受力图',seconds:{exam:60,normal:90,relaxed:120}},{name:'Q2',type:'运动',seconds:{exam:120,normal:150,relaxed:180}}]};
test('imports ordered questions and preserves timing options through schedule storage',()=>{
 const parsed=E.parseImport(JSON.stringify(data)), s=E.importedSession(parsed,Date.parse('2026-11-14T04:00:00Z'));
 assert.equal(s.questions.length,2);assert.equal(s.independent,false);assert.equal(s.questions[0].timingMode,null);
 assert.equal(JSON.stringify(s.questions[0].timingOptions),JSON.stringify({exam:60,normal:90,relaxed:120}));
 s.questions[0].timingMode='exam';s.questions[0].limitSeconds=60;s.questions[0].startedAt=1000;
 const done=E.settle(s,11000);done.questions[0].startedAt=null;
 const valid=validateSession(done);assert.equal(valid.questions[0].elapsedMs,10000);assert.equal(valid.questions[0].timingMode,'exam');
 const state=applyPracticeSession(createEmptyScheduleState(),valid);const recovered=readScheduleState({getItem:()=>JSON.stringify(state)});
 assert.equal(recovered.practiceSessions?.[0].questions[0].timingOptions?.relaxed,120);assert.equal(recovered.practiceSessions?.[0].questions[0].elapsedMs,10000);
});
test('rejects malformed timing, excessive content, and explicit answers',()=>{
 for(const value of [ {...data,questions:[]}, {...data,questions:[{...data.questions[0],seconds:{exam:120,normal:90,relaxed:200}}]}, {...data,questions:[{...data.questions[0],answer:'42'}]}, {...data,questions:[{...data.questions[0],text:'答案：42'}]}, {...data,questions:[{...data.questions[0],text:'x'.repeat(2001)}]} ])assert.throws(()=>E.parseImport(JSON.stringify(value)));
 assert.throws(()=>E.parseImport('not json'));
 const s=E.importedSession(E.parseImport(JSON.stringify(data)),Date.now());s.questions[0].elapsedMs=1;assert.throws(()=>validateSession(s));
 s.questions[0].elapsedMs=0;delete s.questions[0].timingMode;assert.throws(()=>validateSession(s));
});

