// lib/cookie-utils.ts
// Helpers for writing large tokens into chunked cookies and cleaning up old chunks.

function splitIntoChunks(str: string, size = 3800): string[] {
  const out: string[] = []
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size))
  return out
}

type ReqCookies = { get: (name: string) => { name: string; value: string } | undefined }
type ResCookies = { set: (cookie: { name: string; value: string; path?: string; maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: 'lax'|'strict'|'none' }) => void }

export function writeChunkedCookie(
  requestCookies: ReqCookies,
  responseCookies: ResCookies,
  baseName: string,
  value: string,
  options: { path?: string; httpOnly?: boolean; secure?: boolean; sameSite?: 'lax'|'strict'|'none'; maxAge?: number } = {}
) {
  const chunks = splitIntoChunks(value)
  const newCount = chunks.length
  const oldCount = Number(requestCookies.get(`${baseName}-chunks`)?.value || 0)

  // write new chunks (overwrite same-name cookies)
  for (let i = 0; i < newCount; i++) {
    responseCookies.set({
      name: `${baseName}.${i}`,
      value: chunks[i],
      path: options.path ?? '/',
      httpOnly: options.httpOnly ?? true,
      secure: options.secure ?? true,
      sameSite: options.sameSite ?? 'lax',
      maxAge: options.maxAge
    })
  }

  // delete leftover old chunks
  for (let i = newCount; i < oldCount; i++) {
    responseCookies.set({
      name: `${baseName}.${i}`,
      value: '',
      path: options.path ?? '/',
      httpOnly: options.httpOnly ?? true,
      secure: options.secure ?? true,
      sameSite: options.sameSite ?? 'lax',
      maxAge: 0
    })
  }

  // update chunk count marker
  responseCookies.set({
    name: `${baseName}-chunks`,
    value: String(newCount),
    path: options.path ?? '/',
    httpOnly: options.httpOnly ?? true,
    secure: options.secure ?? true,
    sameSite: options.sameSite ?? 'lax',
    maxAge: options.maxAge
  })
}
