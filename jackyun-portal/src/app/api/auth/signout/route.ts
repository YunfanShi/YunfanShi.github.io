import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAuthCookie } from '@/lib/auth-cookies';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }
  const force = request.nextUrl.searchParams.get('force') === '1';
  const response = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  if (!force) {
    try {
      const supabase = await createClient(response);
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) return NextResponse.json({ error: '认证服务暂时不可用，可选择强制退出。' }, { status: 503 });
    } catch {
      return NextResponse.json({ error: '认证服务暂时不可用，可选择强制退出。' }, { status: 503 });
    }
  }
  // Forced logout needs neither a valid session nor a working database.
  for (const { name } of request.cookies.getAll()) {
    if (isAuthCookie(name)) response.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
  return response;
}
