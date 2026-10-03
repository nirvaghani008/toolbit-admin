-- =============================================================================
-- Migration: 20261003123000_add_email_verification_cache_and_metadata.sql
-- Description: 
--   1. Creates public.marketing_email_verifications table for cross-lead deliverability
--      caching (credit optimization: verify once, cached permanently across all leads).
--   2. Updates public.marketing_lead_before_write() trigger to safely preserve
--      verification metadata in business_emails JSONB records:
--        - verified_at
--        - verification_provider
--        - verification_score
--        - verification_status
--   3. Adds RPCs:
--        - marketing_get_email_verifications(p_emails text[])
--        - marketing_save_email_verifications(p_verifications jsonb)
--   4. Pre-seeds marketing_email_verifications from existing leads (deliverable & bounced)
--      so existing known addresses never consume No2Bounce API credits.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Table: public.marketing_email_verifications
--    Global verification cache to optimize third-party API credits.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_email_verifications (
    email                 TEXT PRIMARY KEY,
    status                TEXT NOT NULL CHECK (status IN ('deliverable', 'undeliverable', 'unverified')),
    score                 NUMERIC(5, 2),
    score_status          TEXT,
    provider              TEXT NOT NULL DEFAULT 'no2bounce',
    raw_response          JSONB DEFAULT '{}'::jsonb,
    verified_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketing_email_verifications_status 
    ON public.marketing_email_verifications (status);

CREATE INDEX IF NOT EXISTS idx_marketing_email_verifications_verified_at 
    ON public.marketing_email_verifications (verified_at DESC);

-- Enable RLS
ALTER TABLE public.marketing_email_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_marketing_email_verifications ON public.marketing_email_verifications;
CREATE POLICY admin_all_marketing_email_verifications 
    ON public.marketing_email_verifications
    FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

-- -----------------------------------------------------------------------------
-- 2. Pre-seed marketing_email_verifications from existing leads
--    Transfers already delivered and bounced/undeliverable emails to the cache table
-- -----------------------------------------------------------------------------
INSERT INTO public.marketing_email_verifications (email, status, score_status, provider, verified_at)
SELECT lower(btrim(k.key)) AS email,
       CASE
           WHEN lower(btrim(k.value ->> 'status')) IN ('deliverable', 'undeliverable')
           THEN lower(btrim(k.value ->> 'status'))
           WHEN lower(btrim(k.value ->> 'resend_status')) = 'bounced'
           THEN 'undeliverable'
           WHEN lower(btrim(k.value ->> 'resend_status')) = 'delivered'
           THEN 'deliverable'
           ELSE 'unverified'
       END AS status,
       CASE
           WHEN lower(btrim(k.value ->> 'resend_status')) = 'bounced' THEN 'Bounced (Resend)'
           WHEN lower(btrim(k.value ->> 'resend_status')) = 'delivered' THEN 'Delivered (Resend)'
           ELSE 'Pre-seeded'
       END AS score_status,
       'initial_sync' AS provider,
       COALESCE(
           NULLIF(k.value ->> 'last_bounced_at', '')::timestamptz,
           NULLIF(k.value ->> 'last_delivered_at', '')::timestamptz,
           now()
       ) AS verified_at
  FROM public.marketing_outreach_leads l
 CROSS JOIN LATERAL jsonb_each(l.business_emails) k
 WHERE jsonb_typeof(l.business_emails) = 'object'
   AND NULLIF(btrim(k.key), '') IS NOT NULL
   AND (
       lower(btrim(k.value ->> 'status')) IN ('deliverable', 'undeliverable')
       OR lower(btrim(k.value ->> 'resend_status')) IN ('bounced', 'delivered')
   )
ON CONFLICT (email) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Update Trigger Function: public.marketing_lead_before_write()
--    Preserves verification metadata fields (verified_at, verification_provider,
--    verification_score, verification_status) along with existing fields.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_lead_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();

    -- Fast-path: empty check
    IF NEW.business_emails IS NULL OR NEW.business_emails = '{}'::jsonb THEN
        NEW.business_emails = '{}'::jsonb;
    ELSIF jsonb_typeof(NEW.business_emails) = 'object' THEN
        SELECT COALESCE(
            jsonb_object_agg(
                lower(btrim(k.key)),
                CASE
                    -- Case A: Input is a simple scalar string: wrap in clean { "status": "..." }
                    WHEN jsonb_typeof(k.value) = 'string' THEN
                        jsonb_build_object(
                            'status',
                            CASE
                                WHEN lower(btrim(k.value #>> '{}')) IN ('deliverable', 'undeliverable', 'unverified')
                                THEN lower(btrim(k.value #>> '{}'))
                                ELSE 'unverified'
                            END
                        )
                    -- Case B: Input is an object: validate status and keep ONLY non-null, non-empty fields
                    WHEN jsonb_typeof(k.value) = 'object' THEN
                        (
                            SELECT jsonb_object_agg(clean.prop, clean.val)
                              FROM (
                                  SELECT 'status' AS prop,
                                         to_jsonb(
                                             CASE
                                                 WHEN lower(btrim(k.value ->> 'status')) IN ('deliverable', 'undeliverable', 'unverified')
                                                 THEN lower(btrim(k.value ->> 'status'))
                                                 ELSE 'unverified'
                                             END
                                         ) AS val
                                  UNION ALL
                                  SELECT 'resend_status', to_jsonb(lower(btrim(k.value ->> 'resend_status')))
                                   WHERE NULLIF(btrim(k.value ->> 'resend_status'), '') IS NOT NULL
                                  UNION ALL
                                  SELECT 'bounce_reason', to_jsonb(left(btrim(k.value ->> 'bounce_reason'), 500))
                                   WHERE NULLIF(btrim(k.value ->> 'bounce_reason'), '') IS NOT NULL
                                  UNION ALL
                                  SELECT 'bounce_type', to_jsonb(lower(btrim(k.value ->> 'bounce_type')))
                                   WHERE NULLIF(btrim(k.value ->> 'bounce_type'), '') IS NOT NULL
                                  UNION ALL
                                  SELECT 'last_sent_at', to_jsonb(btrim(k.value ->> 'last_sent_at'))
                                   WHERE NULLIF(btrim(k.value ->> 'last_sent_at'), '') IS NOT NULL
                                  UNION ALL
                                  SELECT 'last_delivered_at', to_jsonb(btrim(k.value ->> 'last_delivered_at'))
                                   WHERE NULLIF(btrim(k.value ->> 'last_delivered_at'), '') IS NOT NULL
                                  UNION ALL
                                  SELECT 'last_bounced_at', to_jsonb(btrim(k.value ->> 'last_bounced_at'))
                                   WHERE NULLIF(btrim(k.value ->> 'last_bounced_at'), '') IS NOT NULL
                                  UNION ALL
                                  SELECT 'last_resend_id', to_jsonb(btrim(k.value ->> 'last_resend_id'))
                                   WHERE NULLIF(btrim(k.value ->> 'last_resend_id'), '') IS NOT NULL
                                  -- Verification Metadata Fields (No2Bounce)
                                  UNION ALL
                                  SELECT 'verification_provider', to_jsonb(lower(btrim(k.value ->> 'verification_provider')))
                                   WHERE NULLIF(btrim(k.value ->> 'verification_provider'), '') IS NOT NULL
                                  UNION ALL
                                  SELECT 'verification_score', to_jsonb(btrim(k.value ->> 'verification_score'))
                                   WHERE NULLIF(btrim(k.value ->> 'verification_score'), '') IS NOT NULL
                                  UNION ALL
                                  SELECT 'verification_status', to_jsonb(btrim(k.value ->> 'verification_status'))
                                   WHERE NULLIF(btrim(k.value ->> 'verification_status'), '') IS NOT NULL
                                  UNION ALL
                                  SELECT 'verified_at', to_jsonb(btrim(k.value ->> 'verified_at'))
                                   WHERE NULLIF(btrim(k.value ->> 'verified_at'), '') IS NOT NULL
                              ) AS clean
                        )
                    ELSE
                        jsonb_build_object('status', 'unverified')
                END
            ),
            '{}'::jsonb
        ) INTO NEW.business_emails
        FROM jsonb_each(NEW.business_emails) AS k(key, value)
        WHERE NULLIF(btrim(k.key), '') IS NOT NULL;
    ELSIF jsonb_typeof(NEW.business_emails) = 'array' THEN
        -- Defensive fallback for array input: convert to clean object with status unverified
        SELECT COALESCE(
            jsonb_object_agg(
                lower(btrim(elem #>> '{}')),
                jsonb_build_object('status', 'unverified')
            ),
            '{}'::jsonb
        ) INTO NEW.business_emails
        FROM jsonb_array_elements(NEW.business_emails) AS elem
        WHERE NULLIF(btrim(elem #>> '{}'), '') IS NOT NULL;
    ELSE
        NEW.business_emails = '{}'::jsonb;
    END IF;

    -- Valid JSON structure guards for other columns
    IF NEW.conversation_history IS NULL OR jsonb_typeof(NEW.conversation_history) <> 'array' THEN
        NEW.conversation_history = '[]'::jsonb;
    END IF;
    IF NEW.sources IS NULL OR jsonb_typeof(NEW.sources) <> 'array' THEN
        NEW.sources = '[]'::jsonb;
    END IF;
    IF NEW.metadata IS NULL OR jsonb_typeof(NEW.metadata) <> 'object' THEN
        NEW.metadata = '{}'::jsonb;
    END IF;
    IF NEW.conversions IS NULL OR jsonb_typeof(NEW.conversions) <> 'object' THEN
        NEW.conversions = '{"summary": {}, "events": []}'::jsonb;
    END IF;

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPC: public.marketing_get_email_verifications(p_emails text[])
--    Fast batch lookup of cached email deliverability verifications.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_get_email_verifications(p_emails text[])
RETURNS TABLE (
    email            TEXT,
    status           TEXT,
    score            NUMERIC(5, 2),
    score_status     TEXT,
    provider         TEXT,
    verified_at      TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT v.email,
           v.status,
           v.score,
           v.score_status,
           v.provider,
           v.verified_at
      FROM public.marketing_email_verifications v
     WHERE v.email = ANY(
         SELECT lower(btrim(e))
           FROM unnest(p_emails) AS e
          WHERE NULLIF(btrim(e), '') IS NOT NULL
     );
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC: public.marketing_save_email_verifications(p_verifications jsonb)
--    Atomically upserts into marketing_email_verifications AND updates
--    business_emails on marketing_outreach_leads if lead_id is provided.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_save_email_verifications(p_verifications jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_item         jsonb;
    v_lead_id      uuid;
    v_email        text;
    v_status       text;
    v_score_raw    text;
    v_score        numeric(5, 2);
    v_score_status text;
    v_provider     text;
    v_raw          jsonb;
    v_count        integer := 0;
    v_now_str      text;
BEGIN
    IF p_verifications IS NULL OR jsonb_typeof(p_verifications) <> 'array' THEN
        RAISE EXCEPTION 'p_verifications must be a JSON array';
    END IF;

    v_now_str := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

    FOR v_item IN SELECT elem FROM jsonb_array_elements(p_verifications) AS elem
    LOOP
        v_email := lower(btrim(COALESCE(v_item ->> 'email', '')));
        IF v_email = '' OR position('@' IN v_email) = 0 THEN
            CONTINUE;
        END IF;

        v_status := lower(btrim(COALESCE(v_item ->> 'status', 'unverified')));
        IF v_status NOT IN ('deliverable', 'undeliverable', 'unverified') THEN
            v_status := 'unverified';
        END IF;

        v_score_raw := NULLIF(btrim(COALESCE(v_item ->> 'score', '')), '');
        BEGIN
            v_score := v_score_raw::numeric(5, 2);
        EXCEPTION
            WHEN OTHERS THEN
                v_score := NULL;
        END;

        v_score_status := NULLIF(btrim(COALESCE(v_item ->> 'score_status', '')), '');
        v_provider := lower(btrim(COALESCE(v_item ->> 'provider', 'no2bounce')));
        v_raw := CASE 
            WHEN jsonb_typeof(COALESCE(v_item -> 'raw_response', v_item -> 'raw')) = 'object' 
            THEN COALESCE(v_item -> 'raw_response', v_item -> 'raw') 
            ELSE '{}'::jsonb 
        END;

        -- 1. Upsert global verification cache
        INSERT INTO public.marketing_email_verifications (
            email, status, score, score_status, provider, raw_response, verified_at, updated_at
        ) VALUES (
            v_email, v_status, v_score, v_score_status, v_provider, v_raw, now(), now()
        )
        ON CONFLICT (email) DO UPDATE SET
            status       = EXCLUDED.status,
            score        = EXCLUDED.score,
            score_status = EXCLUDED.score_status,
            provider     = EXCLUDED.provider,
            raw_response = EXCLUDED.raw_response,
            verified_at  = EXCLUDED.verified_at,
            updated_at   = now();

        -- 2. If lead_id is provided, sync into the lead's structured email record
        IF NULLIF(btrim(COALESCE(v_item ->> 'lead_id', '')), '') IS NOT NULL THEN
            BEGIN
                v_lead_id := (v_item ->> 'lead_id')::uuid;

                UPDATE public.marketing_outreach_leads
                   SET business_emails = business_emails || jsonb_build_object(
                           v_email,
                           COALESCE(business_emails -> v_email, '{}'::jsonb) || jsonb_build_object(
                               'status',                v_status,
                               'verification_score',    COALESCE(v_score_raw, ''),
                               'verification_status',   COALESCE(v_score_status, ''),
                               'verification_provider', v_provider,
                               'verified_at',           v_now_str
                           )
                       ),
                       updated_at = now()
                 WHERE id = v_lead_id
                   AND (business_emails ? v_email OR business_emails = '{}'::jsonb);
            EXCEPTION
                WHEN OTHERS THEN
                    -- Defensive: log error and continue loop
                    RAISE WARNING 'Failed to update business_emails on lead % for email %: %', v_lead_id, v_email, SQLERRM;
            END;
        END IF;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Security Grants (Least Privilege)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.marketing_get_email_verifications(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marketing_save_email_verifications(jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.marketing_get_email_verifications(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marketing_save_email_verifications(jsonb) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Documentation & Schema Cache Reload
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.marketing_email_verifications IS 
    'Global email deliverability verification cache. Stores verification results from No2Bounce to avoid repeated credit consumption.';

NOTIFY pgrst, 'reload schema';

COMMIT;
