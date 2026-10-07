-- =============================================================================
-- Migration: 20261005120000_consolidate_email_verifications_into_leads.sql
-- Description:
--   Consolidates email deliverability verifications directly into the
--   marketing_outreach_leads.business_emails JSONB column as the single source
--   of truth, eliminating the redundant marketing_email_verifications table.
--
--   1. Backfills any verified outcomes from marketing_email_verifications into
--      marketing_outreach_leads.business_emails so no previous verifications are lost.
--   2. Adds RPC: public.marketing_get_lead_email_verifications(p_emails text[])
--      for instant cross-lead verification lookups directly from marketing_outreach_leads.
--   3. Adds RPC: public.marketing_sync_lead_email_verification(...)
--      to propagate verified deliverability outcomes across all leads sharing that address.
--   4. Drops legacy cache RPCs and marketing_email_verifications table.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Backfill existing verification data from marketing_email_verifications
--    into marketing_outreach_leads.business_emails for any unverified leads
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'marketing_email_verifications'
  ) THEN
    UPDATE public.marketing_outreach_leads l
    SET business_emails = (
        SELECT COALESCE(
            jsonb_object_agg(
                k.key,
                CASE
                    WHEN v.email IS NOT NULL AND (k.value ->> 'status' IS NULL OR k.value ->> 'status' = 'unverified') THEN
                        k.value || jsonb_build_object(
                            'status',                v.status,
                            'verification_score',    COALESCE(v.score::text, ''),
                            'verification_status',   COALESCE(v.score_status, ''),
                            'verification_provider', v.provider,
                            'verified_at',           to_char(v.verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                        )
                    ELSE k.value
                END
            ),
            '{}'::jsonb
        )
        FROM jsonb_each(l.business_emails) k
        LEFT JOIN public.marketing_email_verifications v ON lower(btrim(k.key)) = v.email
    ),
    updated_at = now()
    WHERE jsonb_typeof(l.business_emails) = 'object'
      AND EXISTS (
        SELECT 1 
        FROM jsonb_each(l.business_emails) k
        JOIN public.marketing_email_verifications v ON lower(btrim(k.key)) = v.email
        WHERE (k.value ->> 'status' IS NULL OR k.value ->> 'status' = 'unverified')
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. RPC: public.marketing_get_lead_email_verifications(p_emails text[])
--    Batch lookup of verified email addresses directly from marketing_outreach_leads.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_get_lead_email_verifications(p_emails text[])
RETURNS TABLE (
    email            TEXT,
    status           TEXT,
    score            TEXT,
    score_status     TEXT,
    provider         TEXT,
    verified_at      TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT DISTINCT ON (lower(btrim(k.key)))
           lower(btrim(k.key)) AS email,
           lower(btrim(k.value ->> 'status')) AS status,
           k.value ->> 'verification_score' AS score,
           k.value ->> 'verification_status' AS score_status,
           k.value ->> 'verification_provider' AS provider,
           k.value ->> 'verified_at' AS verified_at
      FROM public.marketing_outreach_leads l
     CROSS JOIN LATERAL jsonb_each(l.business_emails) k
     WHERE jsonb_typeof(l.business_emails) = 'object'
       AND lower(btrim(k.key)) = ANY(
           SELECT lower(btrim(e))
             FROM unnest(p_emails) AS e
            WHERE NULLIF(btrim(e), '') IS NOT NULL
       )
       AND lower(btrim(k.value ->> 'status')) IN ('deliverable', 'undeliverable')
     ORDER BY lower(btrim(k.key)), l.updated_at DESC;
$$;

-- -----------------------------------------------------------------------------
-- 3. RPC: public.marketing_sync_lead_email_verification(...)
--    Synchronizes a verified deliverability outcome across all leads that have
--    the given email address in their business_emails map.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_sync_lead_email_verification(
    p_email        TEXT,
    p_status       TEXT,
    p_score        TEXT DEFAULT NULL,
    p_score_status TEXT DEFAULT NULL,
    p_provider     TEXT DEFAULT 'no2bounce',
    p_verified_at  TEXT DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_email        TEXT := lower(btrim(p_email));
    v_status       TEXT := lower(btrim(p_status));
    v_verified_at  TEXT := COALESCE(NULLIF(btrim(p_verified_at), ''), to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    v_updated_count integer := 0;
BEGIN
    IF v_email = '' OR position('@' IN v_email) = 0 THEN
        RETURN 0;
    END IF;

    IF v_status NOT IN ('deliverable', 'undeliverable', 'unverified') THEN
        v_status := 'unverified';
    END IF;

    UPDATE public.marketing_outreach_leads
       SET business_emails = business_emails || jsonb_build_object(
               v_email,
               COALESCE(business_emails -> v_email, '{}'::jsonb) || jsonb_build_object(
                   'status',                v_status,
                   'verification_score',    COALESCE(p_score, ''),
                   'verification_status',   COALESCE(p_score_status, ''),
                   'verification_provider', COALESCE(p_provider, 'no2bounce'),
                   'verified_at',           v_verified_at
               )
           ),
           updated_at = now()
     WHERE business_emails ? v_email;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Drop legacy cache RPCs and separate table
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.marketing_get_email_verifications(text[]);
DROP FUNCTION IF EXISTS public.marketing_save_email_verifications(jsonb);
DROP TABLE IF EXISTS public.marketing_email_verifications CASCADE;

-- -----------------------------------------------------------------------------
-- 5. Security Grants (Least Privilege)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.marketing_get_lead_email_verifications(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marketing_sync_lead_email_verification(text, text, text, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.marketing_get_lead_email_verifications(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marketing_sync_lead_email_verification(text, text, text, text, text, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Schema Cache Reload
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
