-- =============================================================================
-- Migration: Add Marketing Lead Email Operations (RPCs)
-- Created At: 2026-10-02
-- Description:
--   Provides atomic, production-grade operations to add, update, and delete
--   business email addresses on public.marketing_outreach_leads records.
--   Email format validation is handled upstream in TypeScript/Zod before dispatch.
--
--   Key Capabilities:
--     1. public.marketing_add_lead_email(p_lead_id uuid, p_email text)
--        - Trims, lowercases, and appends email if not duplicate.
--     2. public.marketing_update_lead_email(p_lead_id uuid, p_old_email text, p_new_email text)
--        - Replaces old email with new email and deduplicates array.
--     3. public.marketing_delete_lead_email(p_lead_id uuid, p_email text)
--        - Removes specified email address from lead record.
--
--   Security & Performance:
--     - Enforces SET search_path = ''
--     - Uses FOR UPDATE row-level locking for concurrency protection
--     - Leverages trigger trg_marketing_lead_before_write for automated normalization
--     - Revoked from public/anon/authenticated; granted strictly to service_role
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. RPC: Add Single Email to Lead Record
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_add_lead_email(
    p_lead_id uuid,
    p_email   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_email    text;
    v_current_emails text[];
    v_new_emails     text[];
BEGIN
    v_clean_email := lower(btrim(p_email));

    IF v_clean_email IS NULL OR v_clean_email = '' THEN
        RAISE EXCEPTION 'Email address cannot be empty' USING ERRCODE = '22023';
    END IF;

    -- Lock row for concurrency safety
    SELECT business_emails
      INTO v_current_emails
      FROM public.marketing_outreach_leads
     WHERE id = p_lead_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Marketing lead with ID % not found', p_lead_id USING ERRCODE = 'P0002';
    END IF;

    -- If already present in array, return idempotent success
    IF v_clean_email = ANY(COALESCE(v_current_emails, '{}'::text[])) THEN
        RETURN jsonb_build_object(
            'success',         true,
            'lead_id',         p_lead_id,
            'business_emails', to_jsonb(v_current_emails),
            'action',          'noop_already_exists',
            'email',           v_clean_email
        );
    END IF;

    -- Append normalized email
    v_new_emails := array_append(COALESCE(v_current_emails, '{}'::text[]), v_clean_email);

    UPDATE public.marketing_outreach_leads
       SET business_emails = v_new_emails,
           updated_at      = now()
     WHERE id = p_lead_id
    RETURNING business_emails INTO v_new_emails;

    RETURN jsonb_build_object(
        'success',         true,
        'lead_id',         p_lead_id,
        'business_emails', to_jsonb(COALESCE(v_new_emails, '{}'::text[])),
        'action',          'added',
        'email',           v_clean_email
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. RPC: Update Existing Email on Lead Record
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_update_lead_email(
    p_lead_id   uuid,
    p_old_email text,
    p_new_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_old_clean      text;
    v_new_clean      text;
    v_current_emails text[];
    v_new_emails     text[];
BEGIN
    v_old_clean := lower(btrim(p_old_email));
    v_new_clean := lower(btrim(p_new_email));

    IF v_new_clean IS NULL OR v_new_clean = '' THEN
        RAISE EXCEPTION 'New email address cannot be empty' USING ERRCODE = '22023';
    END IF;

    -- Lock row for concurrency safety
    SELECT business_emails
      INTO v_current_emails
      FROM public.marketing_outreach_leads
     WHERE id = p_lead_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Marketing lead with ID % not found', p_lead_id USING ERRCODE = 'P0002';
    END IF;

    -- Replace v_old_clean with v_new_clean and deduplicate
    v_new_emails := ARRAY(
        SELECT DISTINCT CASE WHEN lower(btrim(e)) = v_old_clean THEN v_new_clean ELSE lower(btrim(e)) END
          FROM unnest(COALESCE(v_current_emails, '{}'::text[])) AS e
         WHERE btrim(e) <> ''
    );

    -- If the old email was not found, append new email if not present
    IF NOT (v_old_clean = ANY(COALESCE(v_current_emails, '{}'::text[]))) AND NOT (v_new_clean = ANY(v_new_emails)) THEN
        v_new_emails := array_append(v_new_emails, v_new_clean);
    END IF;

    UPDATE public.marketing_outreach_leads
       SET business_emails = v_new_emails,
           updated_at      = now()
     WHERE id = p_lead_id
    RETURNING business_emails INTO v_new_emails;

    RETURN jsonb_build_object(
        'success',         true,
        'lead_id',         p_lead_id,
        'business_emails', to_jsonb(COALESCE(v_new_emails, '{}'::text[])),
        'action',          'updated',
        'old_email',       v_old_clean,
        'new_email',       v_new_clean
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. RPC: Delete / Remove Email from Lead Record
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_delete_lead_email(
    p_lead_id uuid,
    p_email   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_email    text;
    v_current_emails text[];
    v_new_emails     text[];
BEGIN
    v_clean_email := lower(btrim(p_email));

    -- Lock row for concurrency safety
    SELECT business_emails
      INTO v_current_emails
      FROM public.marketing_outreach_leads
     WHERE id = p_lead_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Marketing lead with ID % not found', p_lead_id USING ERRCODE = 'P0002';
    END IF;

    -- Filter out the email to delete
    v_new_emails := ARRAY(
        SELECT lower(btrim(e))
          FROM unnest(COALESCE(v_current_emails, '{}'::text[])) AS e
         WHERE lower(btrim(e)) <> v_clean_email AND btrim(e) <> ''
    );

    UPDATE public.marketing_outreach_leads
       SET business_emails = COALESCE(v_new_emails, '{}'::text[]),
           updated_at      = now()
     WHERE id = p_lead_id
    RETURNING business_emails INTO v_new_emails;

    RETURN jsonb_build_object(
        'success',         true,
        'lead_id',         p_lead_id,
        'business_emails', to_jsonb(COALESCE(v_new_emails, '{}'::text[])),
        'action',          'deleted',
        'email',           v_clean_email
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Permissions & Grants (Strict Least Privilege)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.marketing_add_lead_email(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_update_lead_email(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_delete_lead_email(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.marketing_add_lead_email(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_update_lead_email(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_delete_lead_email(uuid, text) TO service_role;

COMMENT ON FUNCTION public.marketing_add_lead_email(uuid, text) IS
    'Appends a trimmed, lowercased email to a lead business_emails array.';
COMMENT ON FUNCTION public.marketing_update_lead_email(uuid, text, text) IS
    'Replaces an existing email address on a lead record with a new email.';
COMMENT ON FUNCTION public.marketing_delete_lead_email(uuid, text) IS
    'Removes a specific email address from a lead business_emails array.';

COMMIT;
