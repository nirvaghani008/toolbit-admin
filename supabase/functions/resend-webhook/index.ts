/**
 * Supabase Edge Function: Resend webhook receiver
 * → public.marketing_outreach_leads.conversation_history (+ forward-only lead status)
 *
 * URL (register in Resend → Webhooks):
 *   https://<project-ref>.supabase.co/functions/v1/resend-webhook
 * Events:
 *   email.received, email.sent, email.delivered, email.delivery_delayed,
 *   email.bounced, email.failed, email.suppressed
 *
 * Secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set`):
 *   RESEND_WEBHOOK_SECRET        signing secret of the Resend webhook (whsec_…)
 *   RESEND_API_KEY               full-access Resend key (reads received emails)
 *   MARKETING_OWN_EMAIL_DOMAINS  optional, default "mail.toolbit.ai,toolbit.ai"
 * Provided by Supabase automatically: SUPABASE_URL, SUPABASE_SECRET_KEYS
 * (or legacy SUPABASE_SERVICE_ROLE_KEY).
 *
 * JWT verification must be OFF for this function (Resend sends no Supabase JWT);
 * see supabase/config.toml. Every request is authenticated by the Svix signature
 * check instead, which also rejects stale timestamps (replay protection).
 *
 * Deploy: supabase functions deploy resend-webhook --project-ref <project-ref>
 */

// Versions are pinned exactly in ./deno.json
import { Webhook } from 'svix';
import { createClient } from '@supabase/supabase-js';
import { createResendWebhookHandler, type RpcFn } from '../_shared/resend-webhook-handler.ts';
import { parseOwnDomains } from '../_shared/email-utils.ts';

/** New API keys (SUPABASE_SECRET_KEYS JSON) first, legacy service_role JWT as fallback. */
function resolveSecretKey(): string | undefined {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, unknown>;
      const key = keys?.default ?? Object.values(keys ?? {})[0];
      if (typeof key === 'string' && key) return key;
    } catch {
      // fall through to the legacy key
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || undefined;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const secretKey = resolveSecretKey();

// Service-role client: the marketing_* write functions are executable by service_role only.
const supabaseAdmin =
  supabaseUrl && secretKey
    ? createClient(supabaseUrl, secretKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

const rpc: RpcFn | null = supabaseAdmin
  ? (fn, args) => supabaseAdmin.rpc(fn, args)
  : null;

const handler = createResendWebhookHandler({
  webhookSecret: Deno.env.get('RESEND_WEBHOOK_SECRET') || undefined,
  resendApiKey: Deno.env.get('RESEND_API_KEY') || undefined,
  ownDomains: parseOwnDomains(Deno.env.get('MARKETING_OWN_EMAIL_DOMAINS')),
  createVerifier: (secret) => {
    const webhook = new Webhook(secret); // throws for a malformed secret
    // svix v2: verify() throws on a bad/stale signature and returns nothing on success
    return (payload, headers) => {
      webhook.verify(payload, headers);
    };
  },
  rpc,
});

Deno.serve(handler);
