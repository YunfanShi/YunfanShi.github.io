import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    enabled: process.env.COMPANION_V1_ENABLED === 'true',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    oauthClientId: process.env.NEXT_PUBLIC_COMPANION_OAUTH_CLIENT_ID ?? '',
    apiVersion: 1,
  }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
