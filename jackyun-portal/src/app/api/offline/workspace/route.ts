import { getVerifiedUser } from '@/lib/supabase/verified-user';
import { fetchReviewSnapshot } from '@/lib/review-snapshot-server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReaderBootstrap } from '@/actions/reader';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson } from '@/lib/sync/hash';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await getVerifiedUser(supabase);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const receiptId=request?.nextUrl.searchParams.get('receipt');
  if(receiptId){
    if(!/^[0-9a-f-]{36}$/i.test(receiptId))return NextResponse.json({error:'INVALID_OPERATION_ID'},{status:400});
    const {data,error}=await supabase.from('offline_mutation_receipts').select('result').eq('user_id',user.id).eq('operation_id',receiptId).maybeSingle();
    return error?NextResponse.json({error:'RECEIPT_UNAVAILABLE'},{status:503}):NextResponse.json({ok:true,receipt:data?.result??null});
  }
  const now = new Date().toISOString();
  const scope=request.nextUrl.searchParams.get('scope');
  if(scope&&!['tasks','review','reading'].includes(scope))return NextResponse.json({error:'INVALID_SCOPE'},{status:400});
  const [plans, inbox, review, reading] = await Promise.all([
    !scope||scope==='tasks'?supabase.from('study_plans').select('id, user_id, title, description, start_date, end_date, created_at, updated_at, tasks:study_tasks(id, user_id, plan_id, title, completed, due_date, subject, estimated_minutes, priority, scheduled_at, completed_at, created_at, updated_at)').eq('user_id', user.id).order('created_at', { ascending: false }):Promise.resolve({data:[],error:null}),
    !scope||scope==='tasks'?supabase.from('study_tasks').select('id, title, completed, due_date, estimated_minutes').eq('user_id', user.id).is('plan_id', null).order('created_at', { ascending: false }):Promise.resolve({data:[],error:null}),
    !scope||scope==='review'?fetchReviewSnapshot(supabase, user.id, now):Promise.resolve(null),
    !scope||scope==='reading'?getReaderBootstrap():Promise.resolve(null),
  ]);
  const error = plans.error ?? inbox.error;
  if (error) return NextResponse.json({ error: 'Unable to build offline snapshot' }, { status: 500 });
  if(scope)return NextResponse.json({[scope]:scope==='tasks'?{plans:plans.data??[],inboxTasks:inbox.data??[]}:scope==='review'?review:reading,cachedAt:new Date().toISOString()});
  return NextResponse.json({
    tasks: { plans: plans.data ?? [], inboxTasks: inbox.data ?? [] },
    review,
    reading,
    cachedAt: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const origin=request.headers.get('origin');
  if(origin&&origin!==request.nextUrl.origin)return NextResponse.json({error:'ORIGIN_DENIED'},{status:403});
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return NextResponse.json({error:'JSON_REQUIRED'},{status:415});
  const supabase = await createClient();
  const { data: { user } } = await getVerifiedUser(supabase);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if(Number(request.headers.get('content-length')??0)>65536)return NextResponse.json({error:'PAYLOAD_TOO_LARGE'},{status:413});
  const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
  if(!reader)return NextResponse.json({error:'INVALID_MUTATION'},{status:400});
  try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;
    if(size>65536)return NextResponse.json({error:'PAYLOAD_TOO_LARGE'},{status:413});chunks.push(item.value);}}
  catch{return NextResponse.json({error:'INVALID_MUTATION'},{status:400});}
  finally{await reader.cancel();reader.releaseLock();}
  const bytes=Buffer.concat(chunks);
  let body: {operationId?:string;kind?:string;payload?:Record<string,unknown>;requestHash?:string;expectedUserId?:string};
  try {body=JSON.parse(new TextDecoder().decode(bytes));} catch {return NextResponse.json({error:'INVALID_MUTATION'},{status:400});}
  if(!body?.kind||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))return NextResponse.json({error:'INVALID_MUTATION'},{status:400});
  if(body.expectedUserId&&body.expectedUserId!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:403});
  const operationId=body.operationId??randomUUID();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId))return NextResponse.json({error:'INVALID_OPERATION_ID'},{status:400});
  const requestHash=createHash('sha256').update(canonicalJson({kind:body.kind,payload:body.payload})).digest('hex');
  if(body.requestHash&&body.requestHash!==requestHash)return NextResponse.json({error:'OPERATION_HASH_MISMATCH'},{status:409});
  const {data,error}=await supabase.rpc('apply_offline_mutation',{p_operation_id:operationId,p_kind:body.kind,p_payload:body.payload,p_request_hash:requestHash});
  if(error){
    const status=error.code==='42501'?403:error.code==='23505'?409:error.code==='P0002'?404:error.code?.startsWith('22')||['23502','23503','23514'].includes(error.code)?400:503;
    console.warn('[offline-mutation]',{requestId:request.headers.get('x-request-id'),status,code:/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:'UNAVAILABLE'});
    return NextResponse.json({error:status===503?'SERVICE_UNAVAILABLE':status===409?'OPERATION_ID_REUSED':'MUTATION_REJECTED'},{status});
  }
  return NextResponse.json(data);
}
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
