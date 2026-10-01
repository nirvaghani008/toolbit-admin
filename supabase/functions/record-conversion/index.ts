/**
 * Supabase Edge Function: record-conversion
 * Target: SB1 (Admin / Marketing Supabase)
 *
 * Description:
 *   Secure HTTP receiver that accepts outreach-attributed website conversion
 *   events from the live Toolbit application server.
 *
 * Security:
 *   - Authenticated via Authorization: Bearer <OUTREACH_CONVERSION_SECRET>
 *   - JWT verification is disabled in config.toml because requests originate
 *     from server-to-server HTTP calls with a pre-shared secret.
 *   - Uses Supabase service-role client to execute the RPC
 *     `marketing_record_conversion_event` on public.marketing_outreach_leads.
 *
 * Secrets:
 *   OUTREACH_CONVERSION_SECRET   pre-shared shared secret (64-char random hex string)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided automatically by Supabase)
 */

import { createClient } from '@supabase/supabase-js';

// Resolve service role key supporting both new and legacy formats
function resolveSecretKey(): string | undefined {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, unknown>;
      const key = keys?.default ?? Object.values(keys ?? {})[0];
      if (typeof key === 'string' && key) return key;
    } catch {
      // Fall through to legacy key
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || undefined;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey = resolveSecretKey();

const supabaseAdmin =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

// UUID validation regex (v4 or standard 36-char hex UUID)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // 1. Verify shared bearer secret
  const expectedSecret = Deno.env.get('OUTREACH_CONVERSION_SECRET');
  if (!expectedSecret) {
    console.error('[record-conversion] OUTREACH_CONVERSION_SECRET is not configured in Edge Function secrets.');
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

  if (!token || !timingSafeEqual(token, expectedSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid conversion secret' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!supabaseAdmin) {
    console.error('[record-conversion] Supabase admin client not initialized.');
    return new Response(JSON.stringify({ error: 'Database service unavailable' }), {
      status: 503,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // 2. Parse request payload
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Normalize to an array of event objects
  const rawEvents: any[] = Array.isArray(body?.events)
    ? body.events
    : body && typeof body === 'object'
    ? [body]
    : [];

  if (rawEvents.length === 0) {
    return new Response(JSON.stringify({ error: 'No events provided in request' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (rawEvents.length > 50) {
    return new Response(JSON.stringify({ error: 'Batch size exceeds maximum limit of 50 events' }), {
      status: 413,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const results: any[] = [];
  let acceptedCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;

  for (const item of rawEvents) {
    const leadId = item?.lead_id || item?.outreach_lead_id;
    if (!leadId || !UUID_REGEX.test(leadId)) {
      results.push({
        status: 'invalid',
        lead_id: leadId,
        error: 'Valid UUID lead_id is required',
      });
      rejectedCount++;
      continue;
    }

    try {
      const { data, error } = await supabaseAdmin.rpc('marketing_record_conversion_event', {
        p_lead_id: leadId,
        p_event: item,
      });

      if (error) {
        console.error(`[record-conversion] RPC error for lead ${leadId}:`, error);
        results.push({
          status: 'error',
          lead_id: leadId,
          error: error.message,
        });
        rejectedCount++;
      } else {
        const resObj = (data as any) || {};
        results.push(resObj);
        if (resObj.status === 'duplicate') {
          duplicateCount++;
        } else if (resObj.status === 'processed') {
          acceptedCount++;
        } else {
          rejectedCount++;
        }
      }
    } catch (err: any) {
      console.error(`[record-conversion] Unexpected error for lead ${leadId}:`, err);
      results.push({
        status: 'error',
        lead_id: leadId,
        error: err?.message || 'Processing failed',
      });
      rejectedCount++;
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      accepted: acceptedCount,
      duplicates: duplicateCount,
      rejected: rejectedCount,
      results,
    }),
    {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    }
  );
});
