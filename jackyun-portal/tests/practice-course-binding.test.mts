import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { validateConfig, validateSession, practiceEvidence, type PracticeConfig, type PracticeType, type PracticeSession } from '../src/lib/learning/practice-timer.ts';
import { weeklyPracticeSummary } from '../src/lib/learning/timed-practice.ts';
const context:Record<string,unknown>={structuredClone,crypto:webcrypto};runInNewContext(readFileSync(new URL('../public/practice-engine.js',import.meta.url),'utf8'),context);
type Course={id:string;name:string;shortName?:string};
const E=context.PracticeEngine as {inferCourse:(c:Course)=>string;bindCourses:(c:PracticeConfig,s:Course[])=>{config:PracticeConfig;changed:boolean};courseTypes:(c:PracticeConfig,s:Course)=>PracticeType[];presets:(s:string)=>PracticeType[];question:(i:number,t:PracticeType,m:string)=>PracticeSession['questions'][number]};
test('names and unit abbreviations infer mixed exam boards; unknown names stay unbound',()=>{
  for(const [name,key] of [['数学纯数 P3','math'],['M1','mechanics'],['WST02','statistics'],['FP2','further'],['Physics P1','physics'],['CS A2','cs'],['信息课','unknown']])assert.equal(E.inferCourse({id:name,name}),key);
  assert.equal(E.inferCourse({id:'x',name:'课程一',shortName:'S3'}),'statistics');
  const c=E.bindCourses({subjects:{},green:30,red:10},[{id:'a',name:'P3'},{id:'b',name:'未知课'}]).config;assert.equal(c.courseBindings?.a.family,'math');assert.equal(c.courseBindings?.b,undefined);validateConfig(c);
});
test('manual association and personalized timings survive rename without leaking between courses',()=>{
  const c:PracticeConfig={subjects:{},green:30,red:10,courseBindings:{a:{family:'cs',name:'信息课',source:'manual'},b:{family:'cs',name:'Computer Science',source:'auto'}},courseTypes:{}};
  const types=E.courseTypes(c,{id:'a',name:'信息课'});types[0].seconds.exam=777;c.courseTypes!['a|cs']=types;
  const renamed=E.bindCourses(c,[{id:'a',name:'信息课改名'},{id:'b',name:'Computer Science'}]);assert.equal(renamed.config.courseBindings?.a.name,'信息课改名');assert.equal(renamed.config.courseBindings?.a.source,'manual');assert.equal(E.courseTypes(renamed.config,{id:'a',name:'信息课改名'})[0].seconds.exam,777);assert.notEqual(E.courseTypes(renamed.config,{id:'b',name:'Computer Science'})[0].seconds.exam,777);validateConfig(renamed.config);
  assert.ok(E.courseTypes(renamed.config,{id:'a',name:'信息课改名'}).some(t=>/数据库/.test(t.name)));
});
test('Schedule evidence retains course identity and credits renamed courses by preset family',()=>{
  const q=E.question(0,E.presets('physics')[0],'exam');q.elapsedMs=1200000;q.result='correct';const s:PracticeSession={id:'s',date:'2026-10-14',subject:'我的物理 A2',courseId:'physics-id',presetFamily:'physics',source:'B',independent:true,scope:'',mode:'exam',index:0,updatedAt:1,finished:true,questions:[q]};
  const record=practiceEvidence(validateSession(s))!;assert.equal(record.courseId,'physics-id');assert.equal(record.subject,s.subject);assert.ok(weeklyPracticeSummary([record],s.date).creditedSubjects.has('Physics'));
  assert.throws(()=>validateConfig({subjects:{},green:30,red:10,courseBindings:{bad:{family:'invented',name:'x',source:'manual'}}}));assert.throws(()=>validateConfig({subjects:{x:[{id:'invalid'}]},courseTypes:{x:E.presets('math')},green:30,red:10}));
});
