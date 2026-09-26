/** Includes SSR session chunks and the PKCE verifier, but no application data. */
export function isAuthCookie(name: string): boolean {
  return /^sb-.+-auth-token(?:\.\d+|-code-verifier)?$/.test(name)
    || name.startsWith('supabase-auth-');
}
