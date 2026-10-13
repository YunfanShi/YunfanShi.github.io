import { body, browserContext, fail, pairing, passwordLogin, refresh, verifyMfa, watchContext, WatchError } from '@/lib/watch/server';
import { snapshot } from '@/lib/watch/snapshot';
import { digest, validateOperation, UUID } from '@/lib/watch/policy';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type RouteContext={params:Promise<{action:string[]}>};
async function handle(request:Request,context:RouteContext) {
  try {
    const action=(await context.params).action.join('/');
    if(request.method==='GET') {
      if(action==='devices'){const auth=await browserContext(request);const {data,error}=await auth.admin.from('watch_devices').select('id,name,created_at,last_seen_at,revoked_at').eq('user_id',auth.user.id).order('created_at',{ascending:false}).limit(100);if(error)fail(503,'DEVICE_READ_FAILED','设备读取失败');return reply({devices:data});}
      if(action==='snapshot'){const auth=await watchContext(request);return reply(await snapshot(auth.supabase,auth.user.id,auth.token));}
      return fail(404,'NOT_FOUND','接口不存在');
    }
    if(request.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','方法不支持');
    const value=await body(request);
    if(action==='login')return reply(await passwordLogin(request,value));
    if(action==='refresh')return reply(await refresh(request,value));
    if(action==='mfa')return reply(await verifyMfa(request,value));
    if(action.startsWith('pair/'))return reply(await pairing(request,action.slice(5),value));
    if(action==='devices/revoke') {
      const auth=await browserContext(request,true);if(!UUID.test(String(value.id)))fail(400,'INVALID_DEVICE','设备无效');
      const {error}=await auth.admin.from('watch_devices').update({revoked_at:new Date().toISOString()}).eq('id',value.id).eq('user_id',auth.user.id);if(error)fail(503,'DEVICE_WRITE_FAILED','撤销失败');return reply({ok:true});
    }
    const auth=await watchContext(request);
    if(action==='logout') {const {error}=await auth.admin.from('watch_devices').update({revoked_at:new Date().toISOString()}).eq('id',auth.device.id).eq('user_id',auth.user.id);if(error)fail(503,'DEVICE_WRITE_FAILED','撤销失败');await auth.admin.auth.admin.signOut(auth.token,'local');return reply({ok:true});}
    if(action==='operations') {
      let details:Record<string,unknown>;try{details=validateOperation(value);}catch{fail(422,'INVALID_OPERATION','操作格式无效');}
      const {data,error}=await auth.supabase.rpc('watch_apply_operation',{p_operation:value.operationId,p_hash:digest(JSON.stringify({kind:value.kind,targetId:value.targetId,version:value.version,details:details!})),p_kind:value.kind,p_target:value.kind==='focus'?null:value.targetId,p_version:value.kind==='task'?value.version:null,p_details:details!});
      if(error){if(error.message.includes('VERSION_CONFLICT')||error.message.includes('OPERATION_REUSED'))fail(409,'VERSION_CONFLICT','内容已改变，请保留云端数据');if(error.message.includes('NOT_FOUND'))fail(404,'NOT_FOUND','内容已删除');if(error.message.includes('INVALID_OPERATION'))fail(422,'INVALID_OPERATION','操作内容无效');fail(503,'OPERATION_FAILED','操作暂未确认，可稍后重试');}
      return reply(data??{ok:true});
    }
    return fail(404,'NOT_FOUND','接口不存在');
  } catch(error) {
    if(error instanceof WatchError)return reply({error:error.message,code:error.code},error.status);
    return reply({error:'手表服务暂不可用',code:'WATCH_UNAVAILABLE'},503);
  }
}
function reply(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
export const GET=handle;
export const POST=handle;
