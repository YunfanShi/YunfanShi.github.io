import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import type { PracticeConfig, PracticeType } from '../src/lib/learning/practice-timer.ts';
const context: Record<string,unknown>={structuredClone,crypto:webcrypto};runInNewContext(readFileSync(new URL('../public/practice-engine.js',import.meta.url),'utf8'),context);
type Type=PracticeType&{marks:number;paperId:string;source:string};
const E=context.PracticeEngine as {presets:(s:string)=>Type[];papers:Record<string,{minutes:number;marks:number}>;upgradeConfig:(s:PracticeConfig)=>{config:PracticeConfig;changed:boolean}};
test('Mixed Edexcel and CAIE presets calculate exact seconds from paper duration and representative marks',()=>{
  for(const name of ['Pure Math','Mechanics','Statistics','Further Mathematics','Further Mechanics','Further Statistics','Physics','Chemistry','Biology','Computer Science','Economics','Business','History','Geography','English Language']){
    const types=E.presets(name);assert.ok(types.length>=7&&types.length<=80);assert.ok(types.some(t=>t.name==='基础选择题'));assert.ok(types.some(t=>t.name==='基础大题'));
    for(const t of types){const p=E.papers[t.paperId];assert.equal(t.seconds.exam,Math.round(t.marks*p.minutes/p.marks*60));assert.equal(t.seconds.normal,Math.round(t.marks*p.minutes/p.marks*60*1.2));assert.equal(t.seconds.relaxed,Math.round(t.marks*p.minutes/p.marks*60*1.5));assert.match(t.source,/^https:\/\/(www.cambridgeinternational.org|qualifications.pearson.com)\//);}
  }
  assert.equal(E.presets('Pure Math')[3].seconds.exam,576);assert.equal(E.presets('Mechanics')[2].seconds.exam,576);assert.equal(E.presets('Computer Science')[4].seconds.exam,1800);
  assert.equal(E.presets('IELTS').length,0);assert.equal(E.presets('Unknown subject').length,0);
});
test('legacy defaults migrate once while personalized times and custom types remain intact',()=>{
  const old:PracticeType={id:'physics-0',name:'选择题',description:'概念、单位、数量级',seconds:{exam:120,normal:144,relaxed:180}};
  const custom={...structuredClone(old),id:'physics-1',name:'解释题',description:'定义、因果与图像',seconds:{exam:123,normal:345,relaxed:678}};
  const config:PracticeConfig={subjects:{Physics:[old,custom]},green:30,red:10,sound:false,volume:0.4};
  const upgraded=E.upgradeConfig(config);assert.equal(upgraded.changed,true);assert.equal(upgraded.config.sound,false);assert.equal(upgraded.config.volume,0.4);
  assert.deepEqual(upgraded.config.subjects.Physics.find(t=>t.id===custom.id),custom);assert.ok(upgraded.config.subjects.Physics.some(t=>t.id==='alevel-physics-0'));assert.ok(!upgraded.config.subjects.Physics.some(t=>t.id==='physics-0'));
  assert.equal(config.subjects.Physics.length,2);assert.equal(E.upgradeConfig(upgraded.config).changed,false);
});
