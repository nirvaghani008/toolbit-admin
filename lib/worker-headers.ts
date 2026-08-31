/**
 * Helper function to generate standard HTTP headers for calling Cloudflare Workers
 * from Next.js server actions, route handlers, and background scripts.
 * 
 * Automatically attaches the `x-supabase-mode` header based on NEXT_PUBLIC_SUPABASE_MODE env var.
 */
export function getWorkerFetchHeaders(
  secret?: string,
  extraHeaders?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-supabase-mode': process.env.NEXT_PUBLIC_SUPABASE_MODE || 'cloud',
    ...extraHeaders,
  };
  if (secret) {
    headers['Authorization'] = `Bearer ${secret}`;
  }
  return headers;
}
