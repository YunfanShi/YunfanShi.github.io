import {hasPlanAccess} from '../redemption';
import {fail,watchContext} from './server';
import {UUID} from './policy';
import {readerSelection,readerSegment} from './reader-policy';
type Auth=Awaited<ReturnType<typeof watchContext>>;
async function access(auth:Auth) {
  const [membership,ownership]=await Promise.all([
    auth.admin.from('user_entitlements').select('plan_code,expires_at').eq('user_id',auth.user.id).maybeSingle(),
    auth.admin.from('user_novel_entitlements').select('novel_id').eq('user_id',auth.user.id),
  ]);
  if(membership.error||ownership.error)fail(503,'READER_UNAVAILABLE','阅读权限暂时无法确认');
  const row=membership.data;
  return {plan:row&&(!row.expires_at||row.expires_at>new Date().toISOString())?row.plan_code:'free',owned:new Set((ownership.data??[]).map(item=>item.novel_id))};
}
export async function watchReader(auth:Auth,action:string,value:Record<string,unknown>) {
  const entitlement=await access(auth);
  if(action==='reader/list'){
    const {data,error}=await auth.admin.from('novel_catalog').select('id,title,author,minimum_plan,content_revision,chapters_ready').eq('enabled',true).eq('chapters_ready',true).order('title').limit(501);
    if(error)fail(503,'READER_UNAVAILABLE','书架读取失败');
    return {books:(data??[]).filter(book=>hasPlanAccess(entitlement.plan,book.minimum_plan)||entitlement.owned.has(book.id)).slice(0,100).map(book=>({id:book.id,title:book.title,author:book.author,revision:book.content_revision})),notice:'显示有阅读权限的托管图书；本机导入图书可在手表单独导入 TXT。书架最多显示 100 本。'};
  }
  const id=String(value.id??'');if(!UUID.test(id))fail(400,'INVALID_BOOK','图书参数无效');
  const {data:book,error}=await auth.admin.from('novel_catalog').select('id,title,minimum_plan,content_revision,chapters_ready').eq('id',id).eq('enabled',true).maybeSingle();
  if(error)fail(503,'READER_UNAVAILABLE','图书读取失败');if(!book)fail(404,'BOOK_NOT_FOUND','图书已下架');
  if(!hasPlanAccess(entitlement.plan,book.minimum_plan)&&!entitlement.owned.has(id))fail(403,'READER_FORBIDDEN','当前账号没有阅读权限');
  if(!book.chapters_ready)fail(409,'CHAPTERS_NOT_READY','请先在网页生成托管章节');
  let selection;try{selection=readerSelection(value);}catch{fail(400,'INVALID_POSITION','章节位置无效');}
  if(action==='reader/contents'){
    const {data,error}=await auth.admin.from('novel_catalog_chapters').select('chapter_index,title').eq('novel_id',id).gte('chapter_index',selection!.chapter).order('chapter_index').limit(51);
    if(error)fail(503,'READER_UNAVAILABLE','目录读取失败');
    return {revision:book.content_revision,chapters:(data??[]).slice(0,50),nextChapter:data&&data.length>50?data[50].chapter_index:null};
  }
  if(action==='reader/chapter'){
    const {data,error}=await auth.admin.from('novel_catalog_chapters').select('chapter_index,title,content').eq('novel_id',id).eq('chapter_index',selection!.chapter).maybeSingle();
    if(error)fail(503,'READER_UNAVAILABLE','正文读取失败');if(!data)fail(404,'CHAPTER_NOT_FOUND','没有这一章，请选择目录');
    let segment;try{segment=readerSegment(data.content,selection!.offset);}catch{fail(409,'POSITION_CHANGED','内容已更新，请从本章开头重新读取');}
    return {id,revision:book.content_revision,chapter:data.chapter_index,title:data.title,...segment!};
  }
  return fail(404,'NOT_FOUND','阅读接口不存在');
}
