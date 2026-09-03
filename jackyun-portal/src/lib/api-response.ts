import { NextResponse } from 'next/server';

export function apiError(requestId: string, message: string, status: number, code = 'REQUEST_FAILED') {
  return NextResponse.json({ ok: false, error: { code, message }, requestId }, { status });
}

export function requestIdFrom(request: Request): string {
  return request.headers.get('x-request-id')?.slice(0, 80) || crypto.randomUUID();
}
