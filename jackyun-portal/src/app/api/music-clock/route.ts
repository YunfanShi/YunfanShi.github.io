// Public clock only: no account data or database access is needed.
export async function GET() {
  const receivedAt = Date.now();
  return Response.json({ receivedAt, sentAt: Date.now() }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
