// ============================================
// Bilibili API Proxy
// Proxies B站 API requests to avoid CORS and
// handle referer/cookie requirements
// ============================================

import { NextRequest, NextResponse } from 'next/server';

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

  if (!bvid) {
    return NextResponse.json({ error: 'Missing bvid' }, { status: 400 });
  }

  try {
    if (type === 'info') {
      // Get video info (title, pages, duration, etc.)
      const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
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
      if (!cid) {
        return NextResponse.json({ error: 'Missing cid for playurl' }, { status: 400 });
      }

      // Use fnval=16 (DASH) which works better for proxy
      const qn = searchParams.get('qn') || '80';
      const fnval = searchParams.get('fnval') || '4048'; // 4048=hls, 16=dash, 1=mp4
      const apiUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=${qn}&fnval=${fnval}&fnver=0&fourk=1`;

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

      const decodedUrl = decodeURIComponent(videoUrl);
      
      const res = await fetch(decodedUrl, {
        headers: {
          'Referer': 'https://www.bilibili.com',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Origin': 'https://www.bilibili.com',
        },
      });

      if (!res.ok) {
        return NextResponse.json({ error: `CDN error: ${res.status}` }, { status: res.status });
      }

      // Stream the video file back
      const headers = new Headers();
      headers.set('Content-Type', res.headers.get('Content-Type') || 'video/mp4');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'public, max-age=300');
      
      return new NextResponse(res.body, {
        status: 200,
        headers,
      });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });

  } catch (err) {
    console.error('[BiliProxy] Error:', err);
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}
