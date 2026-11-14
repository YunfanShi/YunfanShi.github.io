import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/supabase/verified-user';

export const dynamic = 'force-dynamic';
const key = 'sync_music_library_v1';
const headers = { 'Cache-Control': 'private, no-store' };
const response = (body:unknown,status=200) => Response.json(body,{status,headers});
async function context() {
  const supabase=await createClient();
  const {data:{user},error}=await getVerifiedUser(supabase);
  if(error && error.name!=='AuthSessionMissingError' && error.status!==401)return {status:503 as const};
  if(!user)return {status:401 as const};
  return {supabase,user,status:200 as const};
}
function valid(value:unknown):value is {playlists:Array<{id:string;name:string;description:string;songs:Array<{id:string;name:string}>}>} & Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value)) return false;
  const items=(value as {playlists?:unknown}).playlists;
  if(!Array.isArray(items)||items.length>100)return false;
  const ids=new Set<string>();let total=0;
  for(const p of items){
    if(!p||typeof p!=='object'||typeof p.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||typeof p.description!=='string'||p.description.length>1000||!Array.isArray(p.songs)||p.songs.length>1000)return false;
    ids.add(p.id);total+=p.songs.length;
    if(total>3000||p.songs.some((s:unknown)=>!s||typeof s!=='object'||typeof (s as {id?:unknown}).id!=='string'||!/^[0-9]{1,30}$/.test((s as {id:string}).id)||typeof (s as {name?:unknown}).name!=='string'||!(s as {name:string}).name.trim()||(s as {name:string}).name.length>200))return false;
  }
  return true;
}
export async function GET(){
  const c=await context();if(c.status!==200)return response({error:c.status===401?'请登录后同步歌单':'暂时无法验证登录状态，本机歌单已保留'},c.status);
  const {data,error}=await c.supabase.from('user_settings').select('value').eq('user_id',c.user.id).eq('key',key).maybeSingle();
  if(error)return response({error:'读取歌单失败'},503);
  const value=data?.value;
  if(value&&(!valid(value)||typeof value.revision!=='string'))return response({error:'云端歌单格式异常，未覆盖本机内容'},409);
  return response({owner:c.user.id,revision:value?.revision??null,playlists:value?.playlists??[]});
}
export async function PUT(request:Request){
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return response({error:'来源无效'},403);
  const c=await context();if(c.status!==200)return response({error:c.status===401?'请登录后同步歌单':'暂时无法验证登录状态，本机歌单已保留'},c.status);
  if(Number(request.headers.get('content-length')||0)>750000)return response({error:'歌单过大'},413);
  const text=await request.text();if(text.length>750000)return response({error:'歌单过大'},413);
  let body:Record<string,unknown>;try{body=JSON.parse(text)}catch{return response({error:'歌单格式无效'},400)}
  if(body?.owner!==c.user.id)return response({error:'登录账号已变化，请重新打开歌单'},409);
  if(!body||!valid(body)||(body.revision!==null&&(typeof body.revision!=='string'||!/^[a-f0-9-]{36}$/.test(body.revision))))return response({error:'歌单格式无效'},400);
  const revision=crypto.randomUUID(),value={revision,playlists:body.playlists},updated_at=new Date().toISOString();
  if(body.revision===null){
    const {error}=await c.supabase.from('user_settings').insert({user_id:c.user.id,key,value,updated_at});
    if(error)return error.code==='23505'?response({error:'歌单已在另一设备更改',conflict:true},409):response({error:'保存歌单失败'},503);
  }else{
    const {data,error}=await c.supabase.from('user_settings').update({value,updated_at}).eq('user_id',c.user.id).eq('key',key).eq('value->>revision',body.revision).select('id');
    if(error)return response({error:'保存歌单失败'},503);
    if(!data?.length)return response({error:'歌单已在另一设备更改',conflict:true},409);
  }
  return response({revision});
}
