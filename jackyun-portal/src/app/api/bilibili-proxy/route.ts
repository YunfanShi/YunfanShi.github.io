// ============================================
// Bilibili API Proxy
// Proxies B站 API requests to avoid CORS and
// handle referer/cookie requirements
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { boundedByteRange, isValidBvid, isValidNumericId, normalizeFnval, normalizeQn, validateBilibiliCdnUrl } from '@/lib/bilibili-security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/bilibili-proxy
 * Proxies requests to Bilibili API
 * Query params:
 *   type: 'info' | 'playurl'
 *   bvid: BV number
 *   cid: cid (required for playurl)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'info';
  const bvid = searchParams.get('bvid');

  if (type !== 'videoproxy' && !isValidBvid(bvid)) {
    return NextResponse.json({ error: 'Invalid bvid' }, { status: 400 });
  }

  try {
    if (type === 'info') {
      // Get video info (title, pages, duration, etc.)
      const apiUrl = new URL('https://api.bilibili.com/x/web-interface/view');
      apiUrl.searchParams.set('bvid', bvid!);
      const res = await fetch(apiUrl, {
        headers: {
          'Referer': 'https://www.bilibili.com',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
        },
        next: { revalidate: 60 },
      });

      if (!res.ok) {
        return NextResponse.json({ error: `B站 API error: ${res.status}` }, { status: res.status });
      }

      const data = await res.json();
      return NextResponse.json(data);
    }

    if (type === 'playurl') {
      // Get video play URL (mp4/m3u8 direct links)
      const cid = searchParams.get('cid');
      if (!isValidNumericId(cid)) {
        return NextResponse.json({ error: 'Invalid cid for playurl' }, { status: 400 });
      }

      // Use fnval=16 (DASH) which works better for proxy
      const qn = normalizeQn(searchParams.get('qn'));
      const fnval = normalizeFnval(searchParams.get('fnval'));
      const apiUrl = new URL('https://api.bilibili.com/x/player/playurl');
      apiUrl.searchParams.set('bvid', bvid!);
      apiUrl.searchParams.set('cid', cid);
      apiUrl.searchParams.set('qn', qn);
      apiUrl.searchParams.set('fnval', fnval);
      apiUrl.searchParams.set('fnver', '0');
      apiUrl.searchParams.set('fourk', '1');

      const res = await fetch(apiUrl, {
        headers: {
          'Referer': 'https://www.bilibili.com',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
        },
        next: { revalidate: 30 },
      });

      if (!res.ok) {
        return NextResponse.json({ error: `B站 API error: ${res.status}` }, { status: res.status });
      }

      const data = await res.json();
      return NextResponse.json(data);
    }

    if (type === 'videoproxy') {
      // Proxy a B站 video CDN URL through our server
      // This is needed because B站 CDN checks Referer and cookies
      const videoUrl = searchParams.get('url');
      if (!videoUrl) {
        return NextResponse.json({ error: 'Missing url' }, { status: 400 });
      }

      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      let currentUrl = validateBilibiliCdnUrl(videoUrl);
      if (!currentUrl) return NextResponse.json({ error: 'Invalid Bilibili CDN URL' }, { status: 400 });
      let res: Response | null = null;
      for (let redirect = 0; redirect < 3; redirect += 1) {
        res = await fetch(currentUrl, {
          redirect: 'manual',
          headers: {
          'Referer': 'https://www.bilibili.com',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Origin': 'https://www.bilibili.com',
            'Range': boundedByteRange(req.headers.get('range')),
          },
        });
        if (![301, 302, 303, 307, 308].includes(res.status)) break;
        const location = res.headers.get('location');
        currentUrl = location ? validateBilibiliCdnUrl(new URL(location, currentUrl).toString()) : null;
        if (!currentUrl) return NextResponse.json({ error: 'Unsafe CDN redirect' }, { status: 400 });
      }

      if (!res || res.status !== 206) {
        const status = res?.status ?? 502;
        return NextResponse.json({ error: `CDN did not honor the bounded range: ${status}` }, { status: 502 });
      }
      const contentType = res.headers.get('content-type') || '';
      const contentLength = Number(res.headers.get('content-length') || 0);
      if (!/^(video|audio)\//i.test(contentType) && contentType !== 'application/octet-stream') {
        return NextResponse.json({ error: 'Unexpected CDN response type' }, { status: 502 });
      }
      if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Invalid CDN response length' }, { status: 502 });
      }

      // Stream the video file back
      const headers = new Headers();
      headers.set('Content-Type', res.headers.get('Content-Type') || 'video/mp4');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'public, max-age=300');
      const contentRange = res.headers.get('content-range');
      if (contentRange) headers.set('Content-Range', contentRange);
      headers.set('Accept-Ranges', 'bytes');
      
      return new NextResponse(res.body, {
        status: 206,
        headers,
      });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });

  } catch (err) {
    console.error('[BiliProxy] Error:', err);
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}
