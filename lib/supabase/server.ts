// lib/supabase/server.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase helpers.
 *
 * Exports two helpers:
 * - getServerSupabase(): a global singleton suitable for long-lived Node servers
 *   (NOT for Edge runtimes). Use this when you explicitly want a single shared
 *   Supabase client instance on the server (for example, background jobs or
 *   server utilities that are not request-scoped).
 *
 * - createRequestSupabase(): creates a fresh Supabase client for a single
 *   request lifecycle. Use this in middleware / route handlers / server
 *   components when you need request-scoped behavior (do NOT cache this
 *   instance across requests).
 *
 * Rationale: previously code often re-initialized clients in many places which
 * can lead to multiple concurrent auth controllers doing conflicting cookie
 * reads/writes. Centralizing the patterns makes it explicit how to create a
 * singleton versus a request-scoped client and reduces accidental cross-request
 * leaks in Node. For Edge runtimes, avoid using the global singleton.
 */

declare global {
  // Cache for long-lived Node servers only. Do NOT use in Edge runtimes.
  var __supabase_server_client: SupabaseClient | undefined
}

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL environment variable')
}

/**
 * Global server singleton. Use only in Node long-lived servers (not Edge).
 * If you run on Vercel Edge runtime, DO NOT call this function.
 */
export function getServerSupabase(): SupabaseClient {
  // Prefer a service role key for server-wide operations if available.
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY')
  }

  if (typeof global !== 'undefined' && (global as any).__supabase_server_client) {
    return (global as any).__supabase_server_client
  }

  const client = createClient(SUPABASE_URL, key, {
    auth: { persistSession: false }
  })

  if (typeof global !== 'undefined') {
    ;(global as any).__supabase_server_client = client
  }
  return client
}

/**
 * Create a request-scoped Supabase client. This always returns a new client.
 * Use this in middleware, route handlers and server components when the client
 * must not be shared across concurrent requests. Do NOT cache this globally.
 *
 * Example usage in middleware/route handler:
 *   const supabase = createRequestSupabase()
 *
 * If you need to bind cookies or headers from the incoming request to the
 * client for SSR auth helpers, pass them into the helper that integrates
 * with your chosen auth helper library. This function intentionally keeps
 * responsibilities small.
 */
export function createRequestSupabase(): SupabaseClient {
  const key = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('Missing SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY')
  }

  // Each request gets a fresh client instance. Keep persistSession false
  // for server-side environments to avoid client-side storage assumptions.
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } })
}
