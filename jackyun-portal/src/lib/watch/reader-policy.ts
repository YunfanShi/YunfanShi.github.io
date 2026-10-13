export function readerSelection(value:Record<string,unknown>) {
  const chapter=Number(value.chapter??0),offset=Number(value.offset??0);
  if(!Number.isSafeInteger(chapter)||chapter<0||!Number.isSafeInteger(offset)||offset<0)throw Error('无效章节位置');
  return {chapter,offset};
}
export function readerSegment(text:string,offset:number,size=6000) {
  if(offset>text.length)throw Error('章节位置已改变');
  if(offset>0&&offset<text.length&&/[\uDC00-\uDFFF]/u.test(text[offset])&&/[\uD800-\uDBFF]/u.test(text[offset-1]))offset--;
  let end=Math.min(text.length,offset+size);
  if(end<text.length && /[\uD800-\uDBFF]/u.test(text[end-1]))end--;
  return {content:text.slice(offset,end),offset,nextOffset:end<text.length?end:null,totalCharacters:text.length};
}
