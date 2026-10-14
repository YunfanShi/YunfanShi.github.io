import 'server-only';
import { randomInt, randomUUID } from 'node:crypto';
import { createClient as createSupabase, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { createClient as websiteClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchWithTimeout } from '@/lib/request-timeout';
import { digest, sameHash, secret, seal, unseal, UUID } from './policy';

export class WatchError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export function fail(status:number,code:string,message:string):never { throw new WatchError(status,code,message); }
export function adminClient() {
  if (process.env.WATCH_V1_ENABLED!=='true') fail(503,'WATCH_NOT_ENABLED','手表服务尚未启用');
  const admin = createAdminClient(); if (!admin) fail(503,'WATCH_CONFIGURATION','手表账号服务暂不可用'); return admin!;
}
export function authClient(token?: string) {
  return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    auth:{ persistSession:false,autoRefreshToken:false },global:{fetch:fetchWithTimeout,...(token?{headers:{Authorization:`Bearer ${token}`}}:{})},
  });
}
export async function activeAccount(client: SupabaseClient,userId: string) {
  const {data,error}=await client.from('profiles').select('id,email,username,account_status,deleted_at').eq('id',userId).maybeSingle();
  if(error) fail(503,'ACCOUNT_CHECK_FAILED','账号状态读取失败');
  if(!data||data.account_status!=='active'||data.deleted_at) fail(403,'ACCOUNT_DISABLED','账号不可用');
  return data!;
}
async function checkMfa(client: SupabaseClient,userId:string,token:string) {
  const {data,error}=await client.auth.admin.mfa.listFactors({userId});
  if(error) fail(503,'ACCOUNT_CHECK_FAILED','账号验证状态读取失败');
  const factors=data?.factors??[];
  if(factors.some(f=>f.status==='verified')) {
    // This token has already been verified through Auth.getUser; editable metadata is never trusted.
    const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8')) as {aal?:string};
    if(claims.aal!=='aal2') fail(403,'MFA_REQUIRED','账号启用了额外验证，请先完成验证；本测试版暂不支持此账号登录');
  }
}
function sessionId(token:string):string {
  let id:unknown; try {id=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8')).session_id;} catch{fail(401,'INVALID_SESSION','登录会话无效');}
  if(typeof id!=='string'||!UUID.test(id)) fail(401,'INVALID_SESSION','登录会话无效'); return id as string;
}
export async function issueDevice(admin:SupabaseClient,session:Session,name:string) {
  await activeAccount(admin,session.user.id); await checkMfa(admin,session.user.id,session.access_token);
  const deviceId=randomUUID(), deviceSecret=secret(),accessToken=secret(),refreshToken=secret();
  const master=process.env.WATCH_PAIR_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const {error}=await admin.from('watch_devices').insert({id:deviceId,user_id:session.user.id,session_id:sessionId(session.access_token),secret_hash:digest(deviceSecret),access_hash:digest(accessToken),refresh_hash:digest(refreshToken),session_payload:seal({session,accessToken,refreshToken},master),name:name.trim().slice(0,100)||'Android Watch'});
  if(error) fail(503,'DEVICE_WRITE_FAILED','设备注册失败');
  return {deviceId,deviceSecret,accessToken,refreshToken,accountLabel:session.user.email??'JackYun',expiresAt:session.expires_at};
}
async function loginReply(admin:SupabaseClient,session:Session,name:string) {
  await activeAccount(admin,session.user.id);
  const {data,error}=await admin.auth.admin.mfa.listFactors({userId:session.user.id});
  if(error)fail(503,'ACCOUNT_CHECK_FAILED','账号验证状态读取失败');
  const factors=(data?.factors??[]).filter(f=>f.status==='verified');
  const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString('utf8')) as {aal?:string};
  if(factors.length&&claims.aal!=='aal2') {
    const factor=factors.find(f=>f.factor_type==='totp');
    if(!factor)fail(403,'MFA_UNSUPPORTED','此账号需要电话验证，本测试版暂不支持');
    const id=randomUUID(),claimSecret=secret(),master=process.env.WATCH_PAIR_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const {error:writeError}=await admin.from('watch_pairings').insert({id,code:`mfa:${id}`,claim_hash:digest(claimSecret),name,expires_at:new Date(Date.now()+300000).toISOString(),payload:seal({mode:'mfa',session,name,factorId:factor.id},master)});
    if(writeError)fail(503,'MFA_UNAVAILABLE','验证服务暂不可用');
    return {mfaRequired:true,id,claimSecret};
  }
  return {session:await issueDevice(admin,session,name)};
}
export async function verifyMfa(request:Request,value:Record<string,unknown>) {
  await limit(request,'mfa',8);const admin=adminClient();
  const id=String(value.id??''),credential=String(value.claimSecret??''),code=String(value.code??'');
  if(!UUID.test(id)||credential.length>100||!/^\d{6}$/.test(code))fail(400,'INVALID_MFA','请输入六位验证码');
  // Consume before verification: a replay cannot issue a second device. Wrong codes require a new login.
  const {data,error}=await admin.rpc('watch_claim_pair',{p_id:id,p_hash:digest(credential)});
  if(error)fail(503,'MFA_UNAVAILABLE','验证服务暂不可用');if(!data)fail(410,'MFA_EXPIRED','验证已过期，请重新登录');
  const payload=unseal(String(data),process.env.WATCH_PAIR_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY!) as {mode:string;session:Session;name:string;factorId:string};
  if(payload.mode!=='mfa')fail(400,'INVALID_MFA','验证无效，请重新登录');
  const client=authClient();const initial=await client.auth.setSession({access_token:payload.session.access_token,refresh_token:payload.session.refresh_token});
  if(initial.error)fail(401,'MFA_EXPIRED','验证已过期，请重新登录');
  const verified=await client.auth.mfa.challengeAndVerify({factorId:payload.factorId,code});
  if(verified.error)fail(401,'INVALID_MFA','验证码错误，请重新登录');
  const {data:{session}}=await client.auth.getSession();if(!session)fail(401,'INVALID_MFA','验证失败');
  return {session:await issueDevice(admin,session!,payload.name)};
}
export async function watchContext(request:Request) {
  const token=/^Bearer ([A-Za-z0-9_.-]{1,8192})$/.exec(request.headers.get('authorization')??'')?.[1];
  const id=request.headers.get('x-watch-device')??'', credential=request.headers.get('x-watch-secret')??'';
  if(!token||!UUID.test(id)||credential.length>100) fail(401,'UNAUTHORIZED','请重新登录');
  const admin=adminClient();
  const {data:device,error}=await admin.from('watch_devices').select('*').eq('id',id).maybeSingle();
  if(error) fail(503,'DEVICE_CHECK_FAILED','设备状态读取失败');
  if(!device||device.revoked_at||!sameHash(credential,device.secret_hash)) fail(401,'DEVICE_REVOKED','手表授权已撤销，请重新登录');
  if(!sameHash(token!,device.access_hash))fail(401,'DEVICE_REVOKED','手表凭证无效，请重新登录');
  const payload=unseal(device.session_payload,process.env.WATCH_PAIR_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY!) as {session:Session};
  const accountToken=payload.session.access_token;
  const supabase=authClient(accountToken); const {data:{user},error:authError}=await supabase.auth.getUser(accountToken);
  if(authError||!user) fail(401,'TOKEN_EXPIRED','会话已过期');
  if(user!.id!==device.user_id||sessionId(accountToken)!==device.session_id) fail(401,'DEVICE_REVOKED','手表会话不匹配');
  await activeAccount(admin,user!.id); await checkMfa(admin,user!.id,accountToken);
  const {error:seenError}=await admin.from('watch_devices').update({last_seen_at:new Date().toISOString()}).eq('id',id).is('revoked_at',null);
  if(seenError) fail(503,'DEVICE_CHECK_FAILED','设备状态更新失败');
  return {admin,supabase,user:user!,device,token:accountToken};
}
export async function browserContext(request:Request,mutation=false) {
  if(mutation&&request.headers.get('origin')!==new URL(request.url).origin) fail(403,'INVALID_ORIGIN','请从本站账户设置操作');
  const admin=adminClient(),client=await websiteClient(); const {data:{user},error}=await client.auth.getUser();
  if(error||!user) fail(401,'UNAUTHORIZED','请先登录网站');
  await activeAccount(admin,user!.id);
  const {data:{session}}=await client.auth.getSession(); if(!session) fail(401,'UNAUTHORIZED','请重新登录');
  await checkMfa(admin,user!.id,session!.access_token);
  return {admin,user:user!,client};
}
export async function limit(request:Request,action:string,maximum=20) {
  const admin=adminClient();
  const address=request.headers.get('x-vercel-forwarded-for')??request.headers.get('x-real-ip')??'unknown';
  const {data,error}=await admin.rpc('watch_rate_limit',{p_bucket:digest(`${action}:${address}`),p_limit:maximum});
  if(error) fail(503,'RATE_LIMIT_UNAVAILABLE','登录服务暂不可用'); if(!data) fail(429,'RATE_LIMITED','操作过于频繁，请稍后重试');
}
export async function body(request:Request):Promise<Record<string,unknown>> {
  if(Number(request.headers.get('content-length')??0)>32768) fail(413,'BODY_TOO_LARGE','请求过大');
  const reader=request.body?.getReader(); if(!reader) fail(400,'INVALID_BODY','请求无效');
  let size=0;const chunks:Uint8Array[]=[];
  try {while(true){const item=await reader!.read();if(item.done)break;size+=item.value.byteLength;if(size>32768)fail(413,'BODY_TOO_LARGE','请求过大');chunks.push(item.value);}} finally {reader!.releaseLock();}
  try {const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value as Record<string,unknown>;}catch{ return fail(400,'INVALID_BODY','请求格式错误'); }
}
export async function passwordLogin(request:Request,value:Record<string,unknown>) {
  await limit(request,'login',8);const admin=adminClient();
  const identifier=String(value.identifier??'').trim().toLowerCase(),password=String(value.password??'');
  if(!identifier||identifier.length>254||!password||password.length>1024)fail(400,'INVALID_CREDENTIALS','账号或密码错误');
  let email=identifier;
  if(!identifier.includes('@')) {const {data,error}=await admin.from('profiles').select('email').eq('username',identifier).maybeSingle();if(error)fail(503,'LOGIN_UNAVAILABLE','登录服务暂不可用');email=data?.email??'invalid@invalid.example';}
  const client=authClient();const {data,error}=await client.auth.signInWithPassword({email,password});
  if(error||!data.session)fail(401,'INVALID_CREDENTIALS','账号或密码错误');
  return loginReply(admin,data.session!,String(value.name??'Android Watch').slice(0,100));
}
export async function refresh(request:Request,value:Record<string,unknown>) {
  await limit(request,'refresh',60);const admin=adminClient();
  const id=String(value.deviceId??''),credential=String(value.deviceSecret??'');
  if(!UUID.test(id)||credential.length>100)fail(401,'DEVICE_REVOKED','设备授权无效');
  const {data:device,error}=await admin.from('watch_devices').select('*').eq('id',id).maybeSingle();
  if(error)fail(503,'DEVICE_CHECK_FAILED','设备状态读取失败');
  if(!device||device.revoked_at||!sameHash(credential,device.secret_hash))fail(401,'DEVICE_REVOKED','设备授权已撤销');
  if(!sameHash(String(value.refreshToken??''),device.refresh_hash))fail(401,'DEVICE_REVOKED','设备凭证无效');
  const master=process.env.WATCH_PAIR_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const payload=unseal(device.session_payload,master) as {session:Session;accessToken:string;refreshToken:string};
  const client=authClient();const {data,error:authError}=await client.auth.refreshSession({refresh_token:payload.session.refresh_token});
  if(authError||!data.session||data.user?.id!==device.user_id||sessionId(data.session.access_token)!==device.session_id)fail(401,'UNAUTHORIZED','请重新登录');
  await activeAccount(admin,data.user!.id);await checkMfa(admin,data.user!.id,data.session!.access_token);
  const {data:updated,error:writeError}=await admin.from('watch_devices').update({session_payload:seal({...payload,session:data.session},master)}).eq('id',id).eq('session_payload',device.session_payload).is('revoked_at',null).select('id');
  if(writeError||!updated?.length)fail(409,'REFRESH_CHANGED','会话已更新，请重试同步');
  return {session:{deviceId:id,deviceSecret:credential,accessToken:payload.accessToken,refreshToken:payload.refreshToken,expiresAt:data.session!.expires_at,accountLabel:data.user!.email??'JackYun'}};
}
export async function pairing(request:Request,action:string,value:Record<string,unknown>) {
  await limit(request,`pair-${action}`,action==='claim'?120:10);
  const admin=adminClient(), master=process.env.WATCH_PAIR_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if(action==='create') {
    await admin.from('watch_pairings').delete().lt('expires_at',new Date().toISOString());
    const id=randomUUID(), claimSecret=secret(), code=String(randomInt(10000000,99999999));
    const expiresAt=Date.now()+300000;
    const {error}=await admin.from('watch_pairings').insert({id,code,claim_hash:digest(claimSecret),name:String(value.name??'Android Watch').slice(0,100),expires_at:new Date(expiresAt).toISOString()});
    if(error)fail(503,'PAIR_UNAVAILABLE','二维码创建失败，请重试');
    return {id,claimSecret,code,expiresAt,url:`https://jackyun.top/settings/watch?pair=${id}`};
  }
  const id=String(value.id??''), code=String(value.code??'');
  if(action==='inspect'||action==='approve') {
    const browser=await browserContext(request,action==='approve');
    let query=admin.from('watch_pairings').select('id,name,expires_at,payload').gt('expires_at',new Date().toISOString());
    if(UUID.test(id))query=query.eq('id',id);else if(/^\d{8}$/.test(code))query=query.eq('code',code);else fail(400,'INVALID_PAIR','配对码无效');
    const {data:pair,error}=await query.maybeSingle();if(error)fail(503,'PAIR_UNAVAILABLE','配对服务暂不可用');if(!pair)fail(410,'PAIR_EXPIRED','二维码已过期或已领取');
    if(action==='inspect')return {id:pair!.id,name:pair!.name,expiresAt:pair!.expires_at,accountLabel:browser.user.email};
    if(pair!.payload)fail(409,'PAIR_APPROVED','二维码已授权');
    if(!browser.user.email)fail(403,'LOGIN_UNAVAILABLE','账号没有可验证的邮箱');
    const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:browser.user.email!});
    if(linkError||!link.properties?.hashed_token)fail(503,'LOGIN_UNAVAILABLE','设备登录服务暂不可用');
    const client=authClient();const {data,error:loginError}=await client.auth.verifyOtp({type:'magiclink',token_hash:link.properties!.hashed_token});
    if(loginError||!data.session||data.user?.id!==browser.user.id)fail(503,'LOGIN_UNAVAILABLE','设备会话创建失败');
    const issued=await loginReply(admin,data.session!,pair!.name);
    const {data:updated,error:updateError}=await admin.from('watch_pairings').update({user_id:browser.user.id,payload:seal(issued,master),approved_at:new Date().toISOString()}).eq('id',pair!.id).is('payload',null).gt('expires_at',new Date().toISOString()).select('id');
    if(updateError||!updated?.length){if('session' in issued)await admin.from('watch_devices').update({revoked_at:new Date().toISOString()}).eq('id',issued.session!.deviceId);fail(409,'PAIR_EXPIRED','授权已过期或状态已变化');}
    return {ok:true};
  }
  const claimSecret=String(value.claimSecret??'');if(!UUID.test(id)||claimSecret.length>100)fail(400,'INVALID_PAIR','配对凭证无效');
  if(action==='cancel'){const {error}=await admin.from('watch_pairings').delete().eq('id',id).eq('claim_hash',digest(claimSecret));if(error)fail(503,'PAIR_UNAVAILABLE','取消失败');return {ok:true};}
  if(action!=='claim')fail(404,'NOT_FOUND','接口不存在');
  const {data,error}=await admin.rpc('watch_claim_pair',{p_id:id,p_hash:digest(claimSecret)});if(error)fail(503,'PAIR_UNAVAILABLE','配对服务暂不可用');
  if(data)return unseal(String(data),master) as Record<string,unknown>;
  const {data:pending,error:readError}=await admin.from('watch_pairings').select('expires_at,claim_hash').eq('id',id).maybeSingle();
  if(readError)fail(503,'PAIR_UNAVAILABLE','配对服务暂不可用');
  if(!pending||!sameHash(claimSecret,pending.claim_hash)||Date.parse(pending.expires_at)<=Date.now())fail(410,'PAIR_EXPIRED','二维码已过期或已领取');
  return {pending:true};
}
