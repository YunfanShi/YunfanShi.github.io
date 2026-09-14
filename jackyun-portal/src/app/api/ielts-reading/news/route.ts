import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_QUERY_LENGTH = 160;

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/gu, ' ')
    .trim();
}

function field(item: string, name: string): string {
  return decodeXml(item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'iu'))?.[1] ?? '');
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!query || query.length > MAX_QUERY_LENGTH) {
    return Response.json({ error: '请输入 1–160 个字符的新闻主题。' }, { status: 400 });
  }

  const rssUrl = new URL('https://news.google.com/rss/search');
  rssUrl.searchParams.set('q', query);
  rssUrl.searchParams.set('hl', 'en-US');
  rssUrl.searchParams.set('gl', 'US');
  rssUrl.searchParams.set('ceid', 'US:en');

  try {
    const response = await fetch(rssUrl, {
      headers: { Accept: 'application/rss+xml, application/xml;q=0.9' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`News search returned ${response.status}`);
    const xml = await response.text();
    const sources = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/giu)].slice(0, 8).map((match) => {
      const item = match[1];
      const url = field(item, 'link');
      return {
        title: field(item, 'title'),
        url: /^https:\/\//u.test(url) ? url : '',
        source: field(item, 'source'),
        publishedAt: field(item, 'pubDate'),
        snippet: field(item, 'description').slice(0, 600),
      };
    }).filter((item) => item.title && item.url);
    if (!sources.length) return Response.json({ error: '没有找到可用的英文新闻来源，请换一个关键词。' }, { status: 404 });
    return Response.json({ query, searchedAt: new Date().toISOString(), sources }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? `新闻检索失败：${error.message}` : '新闻检索失败。' }, { status: 502 });
  }
}
