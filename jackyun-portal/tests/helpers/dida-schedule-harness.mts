

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { normalizeDidaTasks } from '../../src/lib/integrations/dida-schedule.ts';
import * as references from '../../src/lib/integrations/dida-task-reference.ts';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const accountId = '11111111-1111-4111-8111-111111111111';
const routeCode = ts.transpileModule(readFileSync(new URL('../../src/app/api/integrations/dida365/schedule-sync/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

export function harness(options: { signedIn?: boolean; account?: boolean; selected?: string[]; refuseChange?: boolean; error?: boolean } = {}) {
  const calls: {path:string;body?:Record<string,unknown>}[]=[]; const filters: [string,unknown][]=[];
  const task = {id:'task',projectId:'p',title:'Own task',status:0,content:'Keep this',repeatFlag:'RRULE:FREQ=DAILY'};
  let settings: Record<string,unknown> = {projectId:'send-default',syncProjectIds:options.selected??['p'],timeZone:'Asia/Shanghai'};
  const db = { auth:{getUser:async()=>({data:{user:options.signedIn===false?null:{id:'owner'}}})}, from:(table:string)=> {
    const query = { select:()=>query, eq:(key:string,value:unknown)=>{filters.push([key,value]);return query;}, update:(value:{settings:Record<string,unknown>})=>{settings=value.settings;return query;}, maybeSingle:async()=>({data:table==='external_accounts'?(options.account===false?null:{id:accountId,status:'active',settings}):{encrypted_access_token:'encrypted'},error:null}), then:(resolve:(value:unknown)=>void)=>resolve({error:null}) };
    return query;
  }};
  class ApiError extends Error { readonly status:number; constructor(message:string,status=502){super(message);this.status=status;} }
  const remote = async (_token:string,path:string,init?:RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({path,body});
    if(options.error)throw new ApiError('远端失败');
    if(path==='/project/p/data')return {tasks:[task]};
    if(path==='/task/completed')return [{...task,id:'done',title:'Previously completed',status:2}];
    if(path.endsWith('/complete')){if(!options.refuseChange)task.status=2;return undefined;}
    if(path==='/task/batch'){if(!options.refuseChange)task.status=0;return {id2error:{}};}
    if(path==='/project/p/task/task')return {...task};
    throw Error('Unexpected '+path);
  };
  const exports:Record<string,(req:Request)=>Promise<Response>>={};
  const mocks:Record<string,unknown>={ 'server-only':{}, '@/lib/supabase/server':{createClient:async()=>db}, '@/lib/secret-crypto':{decryptSecret:()=> 'server-only-token'}, '@/lib/integrations/dida365-server':{didaRequest:remote,DidaApiError:ApiError,getDidaProjects:async()=>[{id:'p',name:'My list'},{id:'q',name:'Other list'}]}, './dida-schedule':{normalizeDidaTasks}, './dida-task-reference':references };
  mocks['./dida365-server']=mocks['@/lib/integrations/dida365-server'];
  const service:Record<string,unknown>={};const serviceCode=ts.transpileModule(readFileSync(new URL('../../src/lib/integrations/dida-sync-service.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const load=(name:string)=>{if(name in mocks)return mocks[name];throw Error(name);};
  new Function('require','exports',serviceCode)(load,service);mocks['@/lib/integrations/dida-sync-service']=service;
  new Function('require','exports',routeCode)(load,exports);
  const request=(method:string,body?:Record<string,unknown>)=>new Request(`http://localhost/api/integrations/dida365/schedule-sync?accountId=${accountId}`,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId,...body})}:{})});
  return {exports,request,calls,filters,task,getSettings:()=>settings,service,DidaApiError:ApiError};
}
