import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {ERROR_CODES,resolveErrorCode} from '../src/lib/error-codes.ts';

test('all error families have distinct documented codes and safe user messages',()=>{
  const aliases=new Set<string>();
  const docs=readFileSync(new URL('../docs/error-codes.md',import.meta.url),'utf8');
  for(const [code,entry] of Object.entries(ERROR_CODES)){
    assert.match(code,/^JY-\d{4}$/);assert.ok(entry.message && entry.action);assert.ok(docs.includes(code));
    for(const alias of entry.aliases){assert.ok(!aliases.has(alias));aliases.add(alias);assert.equal(resolveErrorCode({code:alias}),code);}
  }
  assert.equal(resolveErrorCode({status:503,code:'SYNC_WRITE_FAILED'}),'JY-2102');
  assert.equal(resolveErrorCode({status:401}),'JY-1001');
  assert.equal(resolveErrorCode({status:413}),'JY-3002');
  assert.equal(resolveErrorCode({status:429}),'JY-2003');
  assert.equal(resolveErrorCode({tag:'AIParse'}),'JY-5001');
  assert.equal(resolveErrorCode({tag:'ErrorBoundary'}),'JY-4001');
  assert.equal(resolveErrorCode({message:'云端版本发生回退'}),'JY-2106');
  assert.equal(resolveErrorCode({code:'FUTURE_UNKNOWN_ERROR'}),'JY-9001');
});

test('browser bundle and TypeScript resolve identical codes and repeated errors are bounded',()=>{
  const window=new EventTarget() as EventTarget & Record<string,unknown>;
  const document=new EventTarget() as EventTarget & Record<string,unknown>;
  document.body=null;
  window.fetch=async()=>Response.json({ok:true});
  const xhr=function(){};xhr.prototype={open(){},send(){}};
  const console={error(){}};
  const context={window,parent:window,document,location:new URL('https://test/schedule?token=private'),XMLHttpRequest:xhr,crypto,URL,Response,Error,console,Date,ErrorEvent:class{},navigator:{}};
  runInNewContext(readFileSync(new URL('../public/shared/error-notices.js',import.meta.url),'utf8'),context);
  const resolver=window.JackyunResolveErrorCode as typeof resolveErrorCode;
  for(const code of Object.keys(ERROR_CODES))assert.equal(resolver({code}),resolveErrorCode({code}));
  const api=window.JackyunErrors as {report(input:unknown):void;getNotices():Array<{code:string;count:number;detail:unknown}>};
  api.report({code:'SYNC_WRITE_FAILED',token:'hidden',url:'https://test/api/sync/v2?token=hidden',message:'Bearer abc.def'});
  api.report({code:'SYNC_WRITE_FAILED',url:'https://test/api/sync/v2?other=value'});
  assert.equal(api.getNotices().length,1);assert.equal(api.getNotices()[0].count,2);
  for(const code of ['AI_PARSE_FAILED','STORAGE_FAILED','CLIENT_RUNTIME_ERROR'])api.report({code});
  assert.equal(api.getNotices().length,3);
  api.report({name:'AbortError',code:'FETCH_FAILED'});assert.equal(api.getNotices().length,3);
  const raw=JSON.stringify(api.getNotices());assert.doesNotMatch(raw,/token=private|other=value/);
});

test('every standalone HTML page loads shared errors directly or through its dialog runtime',()=>{
  const root=new URL('../public/',import.meta.url);
  for(const name of readdirSync(root).filter(file=>file.endsWith('.html'))){
    const html=readFileSync(new URL(name,root),'utf8');
    assert.match(html,/\/shared\/(?:site-dialog|error-notices)\.js/,name);
  }
});
