-- =============================================================================
-- Migration: Setup Marketing Outreach Leads Table and Unified Functionality
-- Created At: 2026-09-30
-- Description:
--   Consolidated, production-grade migration creating public.marketing_outreach_leads
--   and its entire operational suite for the admin outreach pipeline.
--
--   Architectural Optimizations:
--     1. Solution A: Single Canonical Tool Key Pattern (public.marketing_canonical_tool_key)
--        - Eliminates complex 20+ branch procedural logic inside queries.
--        - Standalone domains map to host (e.g. 'cursor.com').
--        - Multi-tenant shared platforms map to host + identifier (e.g. 'github.com/facebook/react').
--        - Match condition is a clean, single-line equality: canonical_key = input_key.
--     2. Data Normalization at Source:
--        - Trigger (marketing_lead_before_write) trims, lowercases, and deduplicates business_emails.
--     3. Consolidated GIN Indexing:
--        - Drops duplicate idx_marketing_outreach_leads_business_emails_lower_gin.
--        - Single unified GIN index on business_emails for sub-millisecond lookups.
--     4. Streamlined Function Footprint:
--        - Inlined internal helpers (status ranks, thread refresh, promotion, normalizer).
--        - Leaves only the real operational API contracts in the database.
--
--   Idempotent & safe to run on fresh or existing databases.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Drop Obsolete / Redundant Functions & Expression Indexes
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.marketing_lower_email_array(text[]) CASCADE;
DROP FUNCTION IF EXISTS public.marketing_message_status_rank(text) CASCADE;
DROP FUNCTION IF EXISTS public.marketing_lead_status_rank(text) CASCADE;
DROP FUNCTION IF EXISTS public.marketing_promote_lead_status(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.marketing_refresh_conversation_thread(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.marketing_normalize_conversation_history(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.marketing_shared_site_key(text) CASCADE;
DROP INDEX IF EXISTS public.idx_marketing_outreach_leads_business_emails_lower_gin;
DROP INDEX IF EXISTS public.idx_ai_tools_site_host;
DROP INDEX IF EXISTS public.idx_ai_tool_submissions_site_host;


-- -----------------------------------------------------------------------------
-- 2. Trigger Function: Normalize data and update timestamp before write
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_lead_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();

    -- Normalize business_emails to trimmed, lowercased, deduplicated array
    IF NEW.business_emails IS NOT NULL THEN
        NEW.business_emails = ARRAY(
            SELECT DISTINCT lower(btrim(e))
              FROM unnest(NEW.business_emails) AS e
             WHERE btrim(e) <> ''
        );
    ELSE
        NEW.business_emails = '{}'::text[];
    END IF;

    -- Ensure conversation_history is a valid JSONB array
    IF NEW.conversation_history IS NULL OR jsonb_typeof(NEW.conversation_history) <> 'array' THEN
        NEW.conversation_history = '[]'::jsonb;
    END IF;

    -- Ensure sources is a valid JSONB array
    IF NEW.sources IS NULL OR jsonb_typeof(NEW.sources) <> 'array' THEN
        NEW.sources = '[]'::jsonb;
    END IF;

    -- Ensure metadata is a valid JSONB object
    IF NEW.metadata IS NULL OR jsonb_typeof(NEW.metadata) <> 'object' THEN
        NEW.metadata = '{}'::jsonb;
    END IF;

    RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 3. Table: public.marketing_outreach_leads & Column Verification
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_outreach_leads (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sources              JSONB NOT NULL DEFAULT '[]'::jsonb,
    user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    tool_name            TEXT NOT NULL,
    tool_site_url        TEXT NOT NULL,
    business_emails      TEXT[] NOT NULL DEFAULT '{}'::text[],
    contact_page_url     TEXT[] NOT NULL DEFAULT '{}'::text[],
    social_links         TEXT[] NOT NULL DEFAULT '{}'::text[],
    marketing_medium     TEXT[],
    status               TEXT NOT NULL DEFAULT 'pending',
    conversation_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_outreach_leads ADD COLUMN IF NOT EXISTS sources JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.marketing_outreach_leads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_outreach_leads ADD COLUMN IF NOT EXISTS tool_name TEXT;
ALTER TABLE public.marketing_outreach_leads ADD COLUMN IF NOT EXISTS tool_site_url TEXT;
ALTER TABLE public.marketing_outreach_leads ADD COLUMN IF NOT EXISTS business_emails TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.marketing_outreach_leads ADD COLUMN IF NOT EXISTS contact_page_url TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.marketing_outreach_leads ADD COLUMN IF NOT EXISTS social_links TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.marketing_outreach_leads ADD COLUMN IF NOT EXISTS marketing_medium TEXT[];
ALTER TABLE public.marketing_outreach_leads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.marketing_outreach_leads ADD COLUMN IF NOT EXISTS conversation_history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.marketing_outreach_leads ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.marketing_outreach_leads ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
ALTER TABLE public.marketing_outreach_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- Strict constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'marketing_outreach_leads_sources_is_array'
    ) THEN
        ALTER TABLE public.marketing_outreach_leads 
        ADD CONSTRAINT marketing_outreach_leads_sources_is_array 
        CHECK (jsonb_typeof(sources) = 'array');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'marketing_outreach_leads_conversation_history_is_array'
    ) THEN
        ALTER TABLE public.marketing_outreach_leads 
        ADD CONSTRAINT marketing_outreach_leads_conversation_history_is_array 
        CHECK (jsonb_typeof(conversation_history) = 'array');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'marketing_outreach_leads_metadata_is_object'
    ) THEN
        ALTER TABLE public.marketing_outreach_leads 
        ADD CONSTRAINT marketing_outreach_leads_metadata_is_object 
        CHECK (jsonb_typeof(metadata) = 'object');
    END IF;
END $$;

-- Attach write trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.marketing_outreach_leads;
DROP TRIGGER IF EXISTS trg_marketing_lead_before_write ON public.marketing_outreach_leads;

CREATE TRIGGER trg_marketing_lead_before_write
BEFORE INSERT OR UPDATE ON public.marketing_outreach_leads
FOR EACH ROW
EXECUTE FUNCTION public.marketing_lead_before_write();


-- -----------------------------------------------------------------------------
-- 4. One-Time Data Backfill / Normalization for Existing Rows
-- -----------------------------------------------------------------------------
UPDATE public.marketing_outreach_leads
   SET business_emails = ARRAY(
           SELECT DISTINCT lower(btrim(e))
             FROM unnest(business_emails) AS e
            WHERE btrim(e) <> ''
       )
 WHERE business_emails IS NOT NULL
   AND business_emails <> '{}'::text[];

UPDATE public.marketing_outreach_leads
   SET conversation_history = '[]'::jsonb
 WHERE conversation_history IS NULL
    OR jsonb_typeof(conversation_history) <> 'array';


-- -----------------------------------------------------------------------------
-- 5. Row Level Security (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.marketing_outreach_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_marketing_outreach_leads ON public.marketing_outreach_leads;
CREATE POLICY admin_all_marketing_outreach_leads 
    ON public.marketing_outreach_leads
    FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS user_select_marketing_outreach_leads ON public.marketing_outreach_leads;
CREATE POLICY user_select_marketing_outreach_leads 
    ON public.marketing_outreach_leads
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);


-- -----------------------------------------------------------------------------
-- 6. Indexes on public.marketing_outreach_leads
--    Retains targeted, actively queried indexes to maximize throughput while
--    eliminating unnecessary write amplification and storage bloat.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_marketing_outreach_leads_user_id 
    ON public.marketing_outreach_leads (user_id) 
    WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_marketing_outreach_leads_status_created 
    ON public.marketing_outreach_leads (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_outreach_leads_tool_site_url 
    ON public.marketing_outreach_leads (tool_site_url);

-- Single unified GIN index on business_emails (always stored trimmed & lowercase)
CREATE INDEX IF NOT EXISTS idx_marketing_outreach_leads_business_emails_gin 
    ON public.marketing_outreach_leads USING gin (business_emails);

-- GIN index for message search and reply correlation
CREATE INDEX IF NOT EXISTS idx_marketing_outreach_leads_conversation_history_gin 
    ON public.marketing_outreach_leads USING gin (conversation_history);

-- Prune unused legacy GIN indexes
DROP INDEX IF EXISTS public.idx_marketing_outreach_leads_social_links_gin;
DROP INDEX IF EXISTS public.idx_marketing_outreach_leads_marketing_medium_gin;
DROP INDEX IF EXISTS public.idx_marketing_outreach_leads_sources_gin;
DROP INDEX IF EXISTS public.idx_marketing_outreach_leads_metadata_gin;


-- -----------------------------------------------------------------------------
-- 7. Helper: Canonical Tool Key Generator (Solution A: Single Canonical Key)
--     Transforms any tool URL into its canonical key:
--       - Standalone website: host (e.g. 'cursor.com', 'jasper.ai')
--       - Shared platform: host + identifier (e.g. 'github.com/facebook/react',
--         'apps.apple.com/id12345', 'chromewebstore.google.com/<32-char-id>')
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_canonical_tool_key(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    WITH u AS (
        SELECT regexp_replace(lower(btrim(COALESCE(p_url, ''))), '^(https?://)?(www\.)?', '') AS rest
    ),
    p AS (
        SELECT rtrim(substring(u.rest FROM '^[^/?#:]*'), '.')                                                AS host,
               regexp_replace(COALESCE(substring(u.rest FROM '^[^/?#]*(/[^?#]*)'), ''), '/{2,}', '/', 'g')   AS path,
               COALESCE(substring(u.rest FROM '\?([^#]*)'), '')                                              AS query
          FROM u
    )
    SELECT CASE
               WHEN p.host = '' THEN NULL

               -- Code repositories: /<owner>/<repo>
               WHEN p.host IN ('github.com', 'gist.github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org', 'replicate.com')
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '^/([^/]+/[^/]+)'))[1], '')

               -- Hugging Face: /spaces|datasets/<owner>/<name>, otherwise /<owner>/<model>
               WHEN p.host = 'huggingface.co'
                   THEN p.host || COALESCE('/' || COALESCE((regexp_match(p.path, '^/((?:spaces|datasets)/[^/]+/[^/]+)'))[1],
                                                           (regexp_match(p.path, '^/([^/]+/[^/]+)'))[1]), '')

               -- Replit: /@<user>/<repl>
               WHEN p.host = 'replit.com'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '^/(@[^/]+/[^/]+)'))[1], '')

               -- Custom GPTs: /g/g-<id>
               WHEN p.host IN ('chatgpt.com', 'chat.openai.com')
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '^/g/(g-[a-z0-9]+)'))[1], '')

               -- Poe bots: /<bot-name>
               WHEN p.host = 'poe.com'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '^/([^/]+)$'))[1], '')

               -- Claude artifacts: /public/artifacts/<id>
               WHEN p.host = 'claude.ai'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '^/public/artifacts/([^/]+)'))[1], '')

               -- Figma community: /community/plugin|widget|file/<id>
               WHEN p.host = 'figma.com'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '^/(community/(?:plugin|widget|file)/[0-9]+)'))[1], '')

               -- App & Extension stores
               WHEN p.host = 'apps.apple.com'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '/(id[0-9]+)(?:/|$)'))[1], '')
               WHEN p.host = 'play.google.com'
                   THEN p.host || COALESCE('/' || (regexp_match(p.query, '(?:^|&)id=([^&]+)'))[1], '')
               WHEN p.host IN ('chromewebstore.google.com', 'chrome.google.com')
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '/([a-p]{32})(?:/|$)'))[1], '')
               WHEN p.host = 'microsoftedge.microsoft.com'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '/([a-z]{32})(?:/|$)'))[1], '')
               WHEN p.host = 'addons.mozilla.org'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '/addon/([^/]+)'))[1], '')
               WHEN p.host = 'marketplace.visualstudio.com'
                   THEN p.host || COALESCE('/' || (regexp_match(p.query, '(?:^|&)itemname=([^&]+)'))[1], '')
               WHEN p.host = 'apps.shopify.com'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '^/([^/]+)'))[1], '')
               WHEN p.host = 'wordpress.org'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '^/(plugins/[^/]+)'))[1], '')
               WHEN p.host = 'zapier.com'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '^/(apps/[^/]+)'))[1], '')

               -- Package registries
               WHEN p.host = 'npmjs.com'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '^/(package/(?:@[^/]+/)?[^/]+)'))[1], '')
               WHEN p.host = 'pypi.org'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '^/(project/[^/]+)'))[1], '')

               -- Product & Site directories
               WHEN p.host = 'producthunt.com'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '^/((?:posts|products)/[^/]+)'))[1], '')
               WHEN p.host = 'sites.google.com'
                   THEN p.host || COALESCE('/' || (regexp_match(p.path, '^/(view/[^/]+)'))[1], '')

               -- Standalone domain: host IS the canonical tool key!
               ELSE p.host
           END
      FROM p;
$$;


-- -----------------------------------------------------------------------------
-- 8. Indexes on ai_tools and ai_tool_submissions (for Outreach Tool Guard)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'ai_tools'
    ) THEN
        DROP INDEX IF EXISTS public.idx_ai_tools_site_host;
        CREATE INDEX IF NOT EXISTS idx_ai_tools_canonical_tool_key
            ON public.ai_tools
         USING btree ((public.marketing_canonical_tool_key(tool_site_url)));
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'ai_tool_submissions'
    ) THEN
        DROP INDEX IF EXISTS public.idx_ai_tool_submissions_site_host;
        CREATE INDEX IF NOT EXISTS idx_ai_tool_submissions_canonical_tool_key
            ON public.ai_tool_submissions
         USING btree ((public.marketing_canonical_tool_key(tool_site_url)));
    END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 9. RPC: Append Message (Atomic + Row-Locked Idempotent Outbound Append)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_append_conversation_message(
    p_lead_id      uuid,
    p_thread_email text,
    p_message      jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_email      text := lower(btrim(p_thread_email));
    v_history    jsonb;
    v_message    jsonb;
    v_ts         timestamptz;
    v_resend_id  text := NULLIF(btrim(p_message ->> 'resend_email_id'), '');
    v_message_id text := NULLIF(btrim(p_message ->> 'message_id'), '');
    v_status     text := COALESCE(NULLIF(btrim(p_message ->> 'status'), ''), 'pending');
    v_thread_idx integer;
    v_thread     jsonb;
BEGIN
    IF p_lead_id IS NULL THEN
        RAISE EXCEPTION 'p_lead_id is required';
    END IF;

    IF v_email IS NULL OR position('@' IN v_email) = 0 THEN
        RAISE EXCEPTION 'p_thread_email must be a valid email address';
    END IF;

    IF p_message IS NULL OR jsonb_typeof(p_message) <> 'object' THEN
        RAISE EXCEPTION 'p_message must be a JSON object';
    END IF;

    IF COALESCE(p_message ->> 'direction', '') NOT IN ('outbound', 'inbound') THEN
        RAISE EXCEPTION 'p_message.direction must be "outbound" or "inbound"';
    END IF;

    IF v_status NOT IN ('pending', 'sent', 'delivered', 'bounced', 'failed') THEN
        RAISE EXCEPTION 'invalid message status: %', v_status;
    END IF;

    -- Normalize timestamp to ISO-8601 UTC so text ordering matches chronological ordering
    BEGIN
        v_ts := COALESCE(NULLIF(p_message ->> 'timestamp', '')::timestamptz, now());
    EXCEPTION
        WHEN invalid_datetime_format OR datetime_field_overflow THEN
            v_ts := now();
    END;

    v_message := p_message || jsonb_build_object(
        'status',    v_status,
        'timestamp', to_char(v_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );

    -- Row lock serializes concurrent writers (send action vs. webhook) per lead
    SELECT CASE WHEN jsonb_typeof(l.conversation_history) = 'array'
                THEN l.conversation_history
                ELSE '[]'::jsonb END
      INTO v_history
      FROM public.marketing_outreach_leads AS l
     WHERE l.id = p_lead_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'marketing_outreach_leads row % not found', p_lead_id;
    END IF;

    -- Idempotency: skip if this message is already stored anywhere on the lead
    IF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(v_history) AS t(thread)
         CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(t.thread -> 'messages') = 'array'
                     THEN t.thread -> 'messages'
                     ELSE '[]'::jsonb END
              ) AS m(msg)
         WHERE (v_resend_id  IS NOT NULL AND m.msg ->> 'resend_email_id' = v_resend_id)
            OR (v_message_id IS NOT NULL AND m.msg ->> 'message_id'      = v_message_id)
    ) THEN
        RETURN FALSE;
    END IF;

    -- Locate parent thread by email (case-insensitive)
    SELECT (t.ord - 1)::integer
      INTO v_thread_idx
      FROM jsonb_array_elements(v_history) WITH ORDINALITY AS t(thread, ord)
     WHERE jsonb_typeof(t.thread) = 'object'
       AND lower(btrim(t.thread ->> 'email')) = v_email
     ORDER BY t.ord
     LIMIT 1;

    IF v_thread_idx IS NULL THEN
        v_thread := jsonb_build_object(
            'email',           v_email,
            'status',          v_status,
            'last_message_at', v_message ->> 'timestamp',
            'messages',        jsonb_build_array(v_message)
        );
        v_history := v_history || jsonb_build_array(v_thread);
    ELSE
        v_thread := v_history -> v_thread_idx;
        v_thread := v_thread || jsonb_build_object(
            'last_message_at', GREATEST(COALESCE(v_thread ->> 'last_message_at', ''), v_message ->> 'timestamp'),
            'status',          CASE
                                   WHEN v_message ->> 'direction' = 'outbound' THEN v_status
                                   ELSE COALESCE(v_thread ->> 'status', 'pending')
                               END,
            'messages',        COALESCE(v_thread -> 'messages', '[]'::jsonb) || jsonb_build_array(v_message)
        );
        v_history := jsonb_set(v_history, ARRAY[v_thread_idx::text], v_thread);
    END IF;

    UPDATE public.marketing_outreach_leads
       SET conversation_history = v_history
     WHERE id = p_lead_id;

    RETURN TRUE;
END;
$$;


-- -----------------------------------------------------------------------------
-- 10. RPC: Outbound Statuses Update (Resend Webhook Handler)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_update_outbound_statuses(p_updates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_map      jsonb;
    v_lead_ids uuid[];
    v_lead     record;
    v_new      jsonb;
    v_count    integer := 0;
BEGIN
    IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
        RAISE EXCEPTION 'p_updates must be a JSON array';
    END IF;

    -- Build map: { "<resend_email_id>": { "status", "message_id", "recipient", "error" } }
    SELECT COALESCE(jsonb_object_agg(
               btrim(u ->> 'resend_email_id'),
               jsonb_build_object(
                   'status',     CASE WHEN u ->> 'status' IN ('pending', 'sent', 'delivered', 'bounced', 'failed')
                                      THEN u ->> 'status' END,
                   'message_id', NULLIF(btrim(u ->> 'message_id'), ''),
                   'recipient',  NULLIF(lower(btrim(u ->> 'recipient')), ''),
                   'error',      NULLIF(left(btrim(u ->> 'error'), 500), '')
               )
           ), '{}'::jsonb)
      INTO v_map
      FROM jsonb_array_elements(p_updates) AS u
     WHERE jsonb_typeof(u) = 'object'
       AND NULLIF(btrim(u ->> 'resend_email_id'), '') IS NOT NULL;

    IF v_map = '{}'::jsonb THEN
        RETURN 0;
    END IF;

    -- Candidate leads via GIN index (one containment probe per ID)
    SELECT array_agg(DISTINCT hit.id)
      INTO v_lead_ids
      FROM jsonb_object_keys(v_map) AS k(resend_id)
     CROSS JOIN LATERAL (
            SELECT l.id
              FROM public.marketing_outreach_leads AS l
             WHERE l.conversation_history @> jsonb_build_array(
                       jsonb_build_object('messages', jsonb_build_array(
                           jsonb_build_object('resend_email_id', k.resend_id)
                       ))
                    )
         ) AS hit;

    IF v_lead_ids IS NULL THEN
        RETURN 0;
    END IF;

    FOR v_lead IN
        SELECT l.id,
               l.status,
               CASE WHEN jsonb_typeof(l.conversation_history) = 'array'
                    THEN l.conversation_history
                    ELSE '[]'::jsonb END AS history
          FROM public.marketing_outreach_leads AS l
         WHERE l.id = ANY (v_lead_ids)
         ORDER BY l.id
           FOR UPDATE
    LOOP
        SELECT COALESCE(jsonb_agg(
                   CASE
                       WHEN jsonb_typeof(t.thread) = 'object'
                        AND jsonb_typeof(t.thread -> 'messages') = 'array'
                       THEN (
                            SELECT t.thread
                                   || jsonb_build_object(
                                       'messages', updated_msgs.list,
                                       'status', COALESCE(
                                           (SELECT m.msg ->> 'status'
                                              FROM jsonb_array_elements(updated_msgs.list) AS m(msg)
                                             WHERE m.msg ->> 'direction' = 'outbound'
                                               AND COALESCE(m.msg ->> 'status', '') <> ''
                                             ORDER BY m.msg ->> 'timestamp' DESC NULLS LAST
                                             LIMIT 1),
                                           t.thread ->> 'status',
                                           'pending'
                                       )
                                   )
                              FROM (
                                    SELECT COALESCE(jsonb_agg(
                                               CASE
                                                   WHEN m.msg ->> 'direction' = 'outbound'
                                                    AND v_map ? COALESCE(m.msg ->> 'resend_email_id', '')
                                                   THEN (
                                                       SELECT m.msg
                                                              || CASE
                                                                     WHEN upd ->> 'status' IS NOT NULL
                                                                      AND (upd ->> 'recipient' IS NULL
                                                                           OR upd ->> 'recipient' = lower(btrim(COALESCE(m.msg ->> 'to', '')))
                                                                           OR upd ->> 'recipient' = lower(btrim(COALESCE(t.thread ->> 'email', ''))))
                                                                      AND (
                                                                           CASE upd ->> 'status'
                                                                               WHEN 'failed' THEN 3
                                                                               WHEN 'bounced' THEN 3
                                                                               WHEN 'delivered' THEN 2
                                                                               WHEN 'sent' THEN 1
                                                                               ELSE 0
                                                                           END
                                                                           >
                                                                           CASE COALESCE(m.msg ->> 'status', '')
                                                                               WHEN 'failed' THEN 3
                                                                               WHEN 'bounced' THEN 3
                                                                               WHEN 'delivered' THEN 2
                                                                               WHEN 'sent' THEN 1
                                                                               ELSE 0
                                                                           END
                                                                          )
                                                                     THEN jsonb_build_object('status', upd ->> 'status')
                                                                          || CASE WHEN upd ->> 'error' IS NOT NULL
                                                                                  THEN jsonb_build_object('error', upd ->> 'error')
                                                                                  ELSE '{}'::jsonb END
                                                                     ELSE '{}'::jsonb
                                                                 END
                                                              || CASE
                                                                     WHEN upd ->> 'message_id' IS NOT NULL
                                                                      AND COALESCE(m.msg ->> 'message_id', '') = ''
                                                                     THEN jsonb_build_object('message_id', upd ->> 'message_id')
                                                                     ELSE '{}'::jsonb
                                                                 END
                                                         FROM (SELECT v_map -> (m.msg ->> 'resend_email_id') AS upd) AS x
                                                   )
                                                   ELSE m.msg
                                               END
                                               ORDER BY m.ord
                                           ), '[]'::jsonb) AS list
                                      FROM jsonb_array_elements(t.thread -> 'messages') WITH ORDINALITY AS m(msg, ord)
                              ) AS updated_msgs
                       )
                       ELSE t.thread
                   END
                   ORDER BY t.ord
               ), '[]'::jsonb)
          INTO v_new
          FROM jsonb_array_elements(v_lead.history) WITH ORDINALITY AS t(thread, ord);

        IF v_new IS DISTINCT FROM v_lead.history THEN
            UPDATE public.marketing_outreach_leads
               SET conversation_history = v_new
             WHERE id = v_lead.id;

            -- First delivery of an outreach email promotes lead to 'emailed' (if still 'pending')
            IF v_lead.status = 'pending' AND EXISTS (
                SELECT 1
                  FROM jsonb_array_elements(v_lead.history) AS t(thread)
                 CROSS JOIN LATERAL jsonb_array_elements(
                        CASE WHEN jsonb_typeof(t.thread -> 'messages') = 'array'
                             THEN t.thread -> 'messages' ELSE '[]'::jsonb END
                      ) AS m(msg)
                 WHERE m.msg ->> 'direction' = 'outbound'
                   AND COALESCE(m.msg ->> 'status', '') NOT IN ('delivered', 'bounced', 'failed')
                   AND (v_map -> (m.msg ->> 'resend_email_id') ->> 'status') = 'delivered'
            ) THEN
                UPDATE public.marketing_outreach_leads
                   SET status   = 'emailed',
                       metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                           'status_automation', jsonb_build_object(
                               'status',          'emailed',
                               'previous_status', 'pending',
                               'reason',          'email.delivered',
                               'source',          'resend_webhook',
                               'at',              to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                           )
                       )
                 WHERE id = v_lead.id
                   AND status = 'pending';
            END IF;
        END IF;
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;


-- -----------------------------------------------------------------------------
-- 11. RPC: Ingest Inbound Email (Replies Ingestion with Advisory Lock & GIN Search)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_ingest_inbound_email(
    p_resend_email_id text,
    p_from_email      text,
    p_reference_ids   text[],
    p_message         jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_resend_id    text := NULLIF(btrim(p_resend_email_id), '');
    v_from         text := lower(btrim(p_from_email));
    v_lead_id      uuid;
    v_thread_email text;
    v_match_type   text;
    v_inserted     boolean;
    v_promoted     boolean := false;
BEGIN
    IF v_resend_id IS NULL THEN
        RAISE EXCEPTION 'p_resend_email_id is required';
    END IF;

    IF p_message IS NULL OR jsonb_typeof(p_message) <> 'object' THEN
        RAISE EXCEPTION 'p_message must be a JSON object';
    END IF;

    -- Serialize concurrent deliveries of the same received email, then de-duplicate across ALL leads
    PERFORM pg_advisory_xact_lock(hashtext('marketing_inbound:' || v_resend_id));

    SELECT l.id
      INTO v_lead_id
      FROM public.marketing_outreach_leads AS l
     WHERE l.conversation_history @> jsonb_build_array(
               jsonb_build_object('messages', jsonb_build_array(
                   jsonb_build_object('resend_email_id', v_resend_id)
               ))
           )
     LIMIT 1;

    IF v_lead_id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'duplicate', 'lead_id', v_lead_id, 'lead_status_changed', false);
    END IF;

    -- a) In-Reply-To / References matching via RFC 5322 Message-ID (single set-based query)
    IF p_reference_ids IS NOT NULL AND cardinality(p_reference_ids) > 0 THEN
        SELECT matched.id, lower(btrim(matched.thread ->> 'email'))
          INTO v_lead_id, v_thread_email
          FROM unnest(p_reference_ids) WITH ORDINALITY AS ref(id, ord)
         CROSS JOIN LATERAL (
                SELECT l.id, t.thread
                  FROM public.marketing_outreach_leads AS l
                 CROSS JOIN LATERAL jsonb_array_elements(
                        CASE WHEN jsonb_typeof(l.conversation_history) = 'array'
                             THEN l.conversation_history ELSE '[]'::jsonb END
                     ) AS t(thread)
                 WHERE NULLIF(btrim(ref.id), '') IS NOT NULL
                   AND l.conversation_history @> jsonb_build_array(
                           jsonb_build_object('messages', jsonb_build_array(
                               jsonb_build_object('message_id', btrim(ref.id))
                           ))
                       )
                   AND t.thread -> 'messages' @> jsonb_build_array(jsonb_build_object('message_id', btrim(ref.id)))
                 LIMIT 1
              ) AS matched
         ORDER BY ref.ord
         LIMIT 1;

        IF v_lead_id IS NOT NULL THEN
            v_match_type := 'message_id';
        END IF;
    END IF;

    -- b) Existing thread matching by sender email (prioritizing most recent outbound send)
    IF v_lead_id IS NULL AND COALESCE(v_from, '') <> '' THEN
        SELECT l.id
          INTO v_lead_id
          FROM public.marketing_outreach_leads AS l
         CROSS JOIN LATERAL (
                SELECT max(m.msg ->> 'timestamp') AS last_outbound_at
                  FROM jsonb_array_elements(
                           CASE WHEN jsonb_typeof(l.conversation_history) = 'array'
                                THEN l.conversation_history ELSE '[]'::jsonb END
                       ) AS t(thread)
                 CROSS JOIN LATERAL jsonb_array_elements(
                        CASE WHEN jsonb_typeof(t.thread -> 'messages') = 'array'
                             THEN t.thread -> 'messages' ELSE '[]'::jsonb END
                     ) AS m(msg)
                 WHERE lower(btrim(t.thread ->> 'email')) = v_from
                   AND m.msg ->> 'direction' = 'outbound'
             ) AS act
         WHERE l.conversation_history @> jsonb_build_array(jsonb_build_object('email', v_from))
         ORDER BY act.last_outbound_at DESC NULLS LAST, l.created_at DESC, l.id
         LIMIT 1;

        IF v_lead_id IS NOT NULL THEN
            v_thread_email := v_from;
            v_match_type   := 'thread_email';
        END IF;
    END IF;

    -- c) Business emails matching (fast GIN lookup on normalized business_emails array)
    IF v_lead_id IS NULL AND COALESCE(v_from, '') <> '' THEN
        SELECT l.id
          INTO v_lead_id
          FROM public.marketing_outreach_leads AS l
         CROSS JOIN LATERAL (
                SELECT max(m.msg ->> 'timestamp') AS last_outbound_at
                  FROM jsonb_array_elements(
                           CASE WHEN jsonb_typeof(l.conversation_history) = 'array'
                                THEN l.conversation_history ELSE '[]'::jsonb END
                       ) AS t(thread)
                 CROSS JOIN LATERAL jsonb_array_elements(
                        CASE WHEN jsonb_typeof(t.thread -> 'messages') = 'array'
                             THEN t.thread -> 'messages' ELSE '[]'::jsonb END
                     ) AS m(msg)
                 WHERE m.msg ->> 'direction' = 'outbound'
             ) AS act
         WHERE l.business_emails @> ARRAY[v_from]
         ORDER BY act.last_outbound_at DESC NULLS LAST, l.created_at DESC, l.id
         LIMIT 1;

        IF v_lead_id IS NOT NULL THEN
            v_thread_email := v_from;
            v_match_type   := 'business_email';
        END IF;
    END IF;

    IF v_lead_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unmatched');
    END IF;

    v_inserted := public.marketing_append_conversation_message(
        v_lead_id,
        v_thread_email,
        p_message || jsonb_build_object(
            'direction',       'inbound',
            'resend_email_id', v_resend_id,
            'status',          COALESCE(NULLIF(p_message ->> 'status', ''), 'delivered'),
            'match_type',      v_match_type
        )
    );

    -- Lead pipeline: first real reply to our outreach -> 'replied' (forward-only from 'pending' or 'emailed')
    IF v_inserted
       AND NOT COALESCE((p_message ->> 'is_auto_reply')::boolean, false)
       AND EXISTS (
            SELECT 1
              FROM public.marketing_outreach_leads AS l
             WHERE l.id = v_lead_id
               AND l.conversation_history @> '[{"messages":[{"direction":"outbound"}]}]'::jsonb
       )
    THEN
        UPDATE public.marketing_outreach_leads AS l
           SET status   = 'replied',
               metadata = COALESCE(l.metadata, '{}'::jsonb) || jsonb_build_object(
                   'status_automation', jsonb_build_object(
                       'status',          'replied',
                       'previous_status', l.status,
                       'reason',          'email.received',
                       'source',          'resend_webhook',
                       'at',              to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                   )
               )
         WHERE l.id = v_lead_id
           AND l.status IN ('pending', 'emailed');

        v_promoted := FOUND;
    END IF;

    RETURN jsonb_build_object(
        'status',              CASE WHEN v_inserted THEN 'processed' ELSE 'duplicate' END,
        'lead_id',             v_lead_id,
        'thread_email',        v_thread_email,
        'match_type',          v_match_type,
        'lead_status_changed', v_promoted
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- 12. RPC: Lookup Inbound Links (Maps Resend IDs to Leads)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_lookup_inbound_links(p_resend_email_ids text[])
RETURNS TABLE (resend_email_id text, lead_id uuid, tool_name text, thread_email text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT DISTINCT ON (ids.rid)
           ids.rid,
           l.id,
           l.tool_name,
           lower(btrim(t.thread ->> 'email'))
      FROM unnest(p_resend_email_ids) AS ids(rid)
      JOIN public.marketing_outreach_leads AS l
        ON l.conversation_history @> jsonb_build_array(
               jsonb_build_object('messages', jsonb_build_array(
                   jsonb_build_object('resend_email_id', ids.rid)
               ))
           )
     CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(l.conversation_history) = 'array'
                 THEN l.conversation_history ELSE '[]'::jsonb END
         ) AS t(thread)
     WHERE NULLIF(btrim(ids.rid), '') IS NOT NULL
       AND t.thread -> 'messages' @> jsonb_build_array(jsonb_build_object('resend_email_id', ids.rid))
     ORDER BY ids.rid, l.updated_at DESC;
$$;


-- -----------------------------------------------------------------------------
-- 13. RPC: Lead Statistics (Single-Pass Aggregation for Admin Stat Cards)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_outreach_lead_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'total',       count(*),
        'with_emails', count(*) FILTER (WHERE l.business_emails <> '{}'::text[]),
        'pending',     count(*) FILTER (WHERE l.status = 'pending'),
        'emailed',     count(*) FILTER (WHERE l.status = 'emailed'),
        'replied',     count(*) FILTER (WHERE l.status = 'replied')
    )
      FROM public.marketing_outreach_leads AS l;
$$;


-- -----------------------------------------------------------------------------
-- 14. Computed Field: conversation_summary (Lightweight Listing Summary)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conversation_summary(p_lead public.marketing_outreach_leads)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH threads AS (
        SELECT t.thread
          FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(p_lead.conversation_history) = 'array'
                        THEN p_lead.conversation_history
                        ELSE '[]'::jsonb END
               ) AS t(thread)
         WHERE jsonb_typeof(t.thread) = 'object'
    ),
    msgs AS (
        SELECT m.msg ->> 'direction' AS direction,
               m.msg ->> 'timestamp' AS ts,
               (COALESCE(m.msg -> 'is_auto_reply', 'false'::jsonb) = 'true'::jsonb) AS is_auto
          FROM threads AS th
         CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(th.thread -> 'messages') = 'array'
                     THEN th.thread -> 'messages'
                     ELSE '[]'::jsonb
                END
             ) AS m(msg)
         WHERE jsonb_typeof(m.msg) = 'object'
    ),
    agg AS (
        SELECT count(*)                                                       AS message_count,
               count(*) FILTER (WHERE direction = 'outbound')                 AS outbound_count,
               count(*) FILTER (WHERE direction = 'inbound')                  AS inbound_count,
               count(*) FILTER (WHERE direction = 'inbound' AND NOT is_auto)   AS reply_count,
               max(ts)                                                        AS last_message_at,
               max(ts) FILTER (WHERE direction = 'inbound')                   AS last_inbound_at,
               (array_agg(direction ORDER BY ts DESC NULLS LAST))[1]          AS last_direction
          FROM msgs
    )
    SELECT jsonb_build_object(
        'thread_count',    (SELECT count(*) FROM threads),
        'message_count',   COALESCE(a.message_count, 0),
        'outbound_count',  COALESCE(a.outbound_count, 0),
        'inbound_count',   COALESCE(a.inbound_count, 0),
        'reply_count',     COALESCE(a.reply_count, 0),
        'last_message_at', a.last_message_at,
        'last_inbound_at', a.last_inbound_at,
        'last_direction',  a.last_direction
    )
      FROM agg AS a;
$$;


-- -----------------------------------------------------------------------------
-- 15. Computed Field: outreach_send_history (Duplicate Send Protection)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.outreach_send_history(p_lead public.marketing_outreach_leads)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH threads AS (
        SELECT t.thread
          FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(p_lead.conversation_history) = 'array'
                        THEN p_lead.conversation_history
                        ELSE '[]'::jsonb END
               ) AS t(thread)
         WHERE jsonb_typeof(t.thread) = 'object'
    ),
    msgs AS (
        SELECT m.msg,
               NULLIF(lower(btrim(COALESCE(th.thread ->> 'email', ''))), '') AS thread_email
          FROM threads AS th
         CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(th.thread -> 'messages') = 'array'
                     THEN th.thread -> 'messages'
                     ELSE '[]'::jsonb
                END
             ) AS m(msg)
         WHERE jsonb_typeof(m.msg) = 'object'
    ),
    replies AS (
        SELECT count(*)                 AS reply_count,
               max(msg ->> 'timestamp') AS last_reply_at
          FROM msgs
         WHERE msg ->> 'direction' = 'inbound'
           AND COALESCE(msg -> 'is_auto_reply', 'false'::jsonb) <> 'true'::jsonb
    ),
    sent AS (
        SELECT btrim(msg ->> 'template_id')  AS template_id,
               count(*)                      AS sent_count,
               max(msg ->> 'timestamp')      AS last_sent_at,
               (array_agg(thread_email ORDER BY msg ->> 'timestamp' DESC NULLS LAST))[1] AS last_sent_to
          FROM msgs
         WHERE msg ->> 'direction' = 'outbound'
           AND COALESCE(btrim(msg ->> 'template_id'), '') <> ''
           AND COALESCE(msg ->> 'status', '') NOT IN ('failed', 'bounced')
         GROUP BY 1
    )
    SELECT jsonb_build_object(
        'reply_count',   r.reply_count,
        'last_reply_at', r.last_reply_at,
        'templates',     COALESCE(
                             (SELECT jsonb_object_agg(
                                         s.template_id,
                                         jsonb_build_object(
                                             'count',        s.sent_count,
                                             'last_sent_at', s.last_sent_at,
                                             'last_sent_to', s.last_sent_to
                                         )
                                     )
                                FROM sent AS s),
                             '{}'::jsonb
                         )
    )
      FROM replies AS r;
$$;


-- -----------------------------------------------------------------------------
-- 16. RPC: Find Existing Tools (Outreach Guard using Canonical Tool Key)
--     Performs direct equality comparison on canonical keys:
--     WHERE canonical_key(t.tool_site_url) = vi.tool_key
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_find_existing_tools(p_site_urls text[])
RETURNS TABLE (
    site_url    text,
    host        text,
    source      text,
    record_id   integer,
    tool_name   text,
    tool_slug   text,
    status      text,
    matched_url text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
    IF COALESCE(cardinality(p_site_urls), 0) > 1000 THEN
        RAISE EXCEPTION 'marketing_find_existing_tools accepts at most 1000 URLs per call (got %)',
                        cardinality(p_site_urls)
              USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH input AS MATERIALIZED (
        SELECT DISTINCT
               u.url AS site_url,
               rtrim(substring(regexp_replace(lower(btrim(COALESCE(u.url, ''))), '^(https?://)?(www\.)?', '') FROM '^[^/?#:]*'), '.') AS host,
               public.marketing_canonical_tool_key(u.url) AS tool_key
          FROM unnest(p_site_urls) AS u(url)
         WHERE u.url IS NOT NULL
    ),
    valid_inputs AS MATERIALIZED (
        SELECT i.site_url, i.host, i.tool_key
          FROM input AS i
         WHERE i.tool_key IS NOT NULL
    )
    SELECT m.site_url, m.host, m.source, m.record_id, m.tool_name, m.tool_slug, m.status, m.matched_url
      FROM (
            SELECT vi.site_url,
                   vi.host,
                   'ai_tools'::text                AS source,
                   t.tool_id                       AS record_id,
                   t.tool_info ->> 'toolName'      AS tool_name,
                   t.tool_url                      AS tool_slug,
                   t.status                        AS status,
                   t.tool_site_url                 AS matched_url
              FROM valid_inputs AS vi
              JOIN public.ai_tools AS t
                ON public.marketing_canonical_tool_key(t.tool_site_url) = vi.tool_key

            UNION ALL

            SELECT vi.site_url,
                   vi.host,
                   'ai_tool_submissions'::text,
                   s.id,
                   s.tool_info ->> 'toolName',
                   s.tool_url,
                   s.status,
                   s.tool_site_url
              FROM valid_inputs AS vi
              JOIN public.ai_tool_submissions AS s
                ON public.marketing_canonical_tool_key(s.tool_site_url) = vi.tool_key
           ) AS m
     ORDER BY m.site_url, (m.source <> 'ai_tools'), m.record_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- 17. Permissions & Grants (Strict Least Privilege)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.marketing_append_conversation_message(uuid, text, jsonb)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_update_outbound_statuses(jsonb)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_ingest_inbound_email(text, text, text[], jsonb)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_lookup_inbound_links(text[])                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_outreach_lead_stats()                           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_canonical_tool_key(text)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_find_existing_tools(text[])                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conversation_summary(public.marketing_outreach_leads)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_send_history(public.marketing_outreach_leads)     FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.marketing_append_conversation_message(uuid, text, jsonb)   TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_update_outbound_statuses(jsonb)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_ingest_inbound_email(text, text, text[], jsonb)  TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_lookup_inbound_links(text[])                     TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_outreach_lead_stats()                           TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_canonical_tool_key(text)                        TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_find_existing_tools(text[])                      TO service_role;
GRANT EXECUTE ON FUNCTION public.conversation_summary(public.marketing_outreach_leads)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_send_history(public.marketing_outreach_leads)     TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 18. Documentation Comments
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.marketing_outreach_leads IS 
    'Tracks outbound and inbound marketing outreach leads for AI tools';

COMMENT ON COLUMN public.marketing_outreach_leads.business_emails IS 
    'Array of normalized, lower-cased business contact emails: ARRAY[''founder@tool.com'', ''support@tool.com'']';

COMMENT ON COLUMN public.marketing_outreach_leads.conversation_history IS
    'Conversation history grouped by parent email: [{"email": "string", "status": "delivered"|"failed"|"sent"|"bounced"|"pending", "last_message_at": "ISO-8601 string", "messages": [...]}]';

COMMENT ON FUNCTION public.marketing_append_conversation_message(uuid, text, jsonb) IS
    'Appends an outbound or inbound message to the specified lead thread atomically with row locking. service_role only.';

COMMENT ON FUNCTION public.marketing_update_outbound_statuses(jsonb) IS
    'Batch updates message delivery statuses from Resend webhooks and promotes lead to "emailed" upon first delivery. service_role only.';

COMMENT ON FUNCTION public.marketing_ingest_inbound_email(text, text, text[], jsonb) IS
    'Correlates inbound replies via Message-ID, thread email, or business_emails, appends message, and promotes lead to "replied". service_role only.';

COMMENT ON FUNCTION public.marketing_lookup_inbound_links(text[]) IS
    'Maps Resend email IDs back to leads and thread emails. service_role only.';

COMMENT ON FUNCTION public.marketing_outreach_lead_stats() IS
    'Single-pass aggregate statistics for the admin outreach dashboard cards. service_role only.';

COMMENT ON FUNCTION public.marketing_canonical_tool_key(text) IS
    'Transforms any tool URL into its canonical key (host for standalone domains; host + repo/package/app identifier for shared platforms like GitHub, HuggingFace, app stores). service_role only.';

COMMENT ON FUNCTION public.marketing_find_existing_tools(text[]) IS
    'Outreach guard: checks input URLs against ai_tools and ai_tool_submissions using canonical tool keys to prevent duplicate outreach. service_role only.';

COMMENT ON FUNCTION public.conversation_summary(public.marketing_outreach_leads) IS
    'PostgREST computed field: returns thread_count, message_count, reply_count, and last_message_at.';

COMMENT ON FUNCTION public.outreach_send_history(public.marketing_outreach_leads) IS
    'PostgREST computed field: returns send history and template statistics used by admin outreach guards.';


-- -----------------------------------------------------------------------------
-- 19. Cleanup deprecated prototyping keys & Reload PostgREST Schema Cache
-- -----------------------------------------------------------------------------
DELETE FROM public.site_settings WHERE key = 'marketing_reply_sync_state';

NOTIFY pgrst, 'reload schema';

COMMIT;
