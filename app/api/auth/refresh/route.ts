// app/api/auth/refresh/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { writeChunkedCookie } from '@/lib/cookie-utils'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const redirectTo = url.searchParams.get('redirect') || '/'

  const refreshToken = req.cookies.get('sb-refresh-token')?.value
  if (!refreshToken || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL) {
    // Nothing we can do; clear auth cookies to force fresh sign-in and redirect back
    const resFail = NextResponse.redirect(redirectTo)
    resFail.cookies.set({ name: 'sb-refresh-token', value: '', path: '/', maxAge: 0 })
    // Attempt to clear chunk marker as well
    resFail.cookies.set({ name: 'sb-access-token-chunks', value: '', path: '/', maxAge: 0 })
    return resFail
  }

  try {
    const tokenEndpoint = `${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/token`
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })

    const resp = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: body.toString()
    })

    if (!resp.ok) {
      // Refresh failed - clear cookies and redirect
      const resFail = NextResponse.redirect(redirectTo)
      resFail.cookies.set({ name: 'sb-refresh-token', value: '', path: '/', maxAge: 0 })
      resFail.cookies.set({ name: 'sb-access-token-chunks', value: '', path: '/', maxAge: 0 })
      return resFail
    }

    const data = await resp.json()
    const accessToken = data.access_token as string | undefined
    const newRefreshToken = data.refresh_token as string | undefined
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : undefined

    if (!accessToken) {
      const resFail = NextResponse.redirect(redirectTo)
      resFail.cookies.set({ name: 'sb-refresh-token', value: '', path: '/', maxAge: 0 })
      resFail.cookies.set({ name: 'sb-access-token-chunks', value: '', path: '/', maxAge: 0 })
      return resFail
    }

    const res = NextResponse.redirect(redirectTo)

    // Write access token in chunked cookies and cleanup old chunks
    writeChunkedCookie(req.cookies as any, res.cookies as any, 'sb-access-token', accessToken, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: expiresIn ?? 60 * 60
    })

    // Write refresh token if provided
    if (newRefreshToken) {
      res.cookies.set({ name: 'sb-refresh-token', value: newRefreshToken, path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 })
    }

    // Mark that we refreshed (optional header for downstream systems)
    res.headers.set('x-supabase-auth-refreshed', '1')

    return res
  } catch (err) {
    // On any unexpected error, clear cookies and redirect
    const resFail = NextResponse.redirect(redirectTo)
    resFail.cookies.set({ name: 'sb-refresh-token', value: '', path: '/', maxAge: 0 })
    resFail.cookies.set({ name: 'sb-access-token-chunks', value: '', path: '/', maxAge: 0 })
    return resFail
  }
}
