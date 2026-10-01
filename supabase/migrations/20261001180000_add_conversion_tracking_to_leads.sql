-- =============================================================================
-- Migration: Add Conversion Tracking to Marketing Outreach Leads (SB1)
-- Created At: 2026-10-01
-- Target Environment: SB1 (Admin / Marketing Database)
--
-- Description:
--   Extends public.marketing_outreach_leads to track website conversions
--   attributed to outreach leads (page visits, signups, submissions, purchases).
--
--   Key Architecture:
--     Unified `conversions` JSONB column:
--     {
--       "summary": {
--         "visit_count": 0,
--         "first_visit_at": "...",
--         "last_visit_at": "...",
--         "signed_up": false,
--         "signed_up_at": null,
--         "toolbit_user_id": null,
--         "toolbit_user_email": null,
--         "submitted": false,
--         "submitted_at": null,
--         "submission_count": 0,
--         "last_submission_id": null,
--         "purchased": false,
--         "purchased_at": null,
--         "purchase_count": 0,
--         "total_spent_usd": 0
--       },
--       "events": [
--         {
--           "id": "uuid",
--           "type": "page_visit|signup|submission|checkout|purchase",
--           "at": "ISO-8601",
--           "session_id": "...",
--           "user_id": "...",
--           "user_email": "...",
--           "page": "...",
--           "utm_source": "...",
--           "utm_medium": "...",
--           "utm_campaign": "...",
--           "data": {...},
--           "idempotency_key": "..."
--         }
--       ]
--     }
--
--   Idempotent & safe to run on fresh or existing databases (losslessly migrates
--   any existing data from conversion_events / conversion_summary).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Add Single Unified Column `conversions`
-- -----------------------------------------------------------------------------
ALTER TABLE public.marketing_outreach_leads
    ADD COLUMN IF NOT EXISTS conversions JSONB NOT NULL DEFAULT '{"summary": {}, "events": []}'::jsonb;

-- -----------------------------------------------------------------------------
-- 2. Migrate Any Existing Data from Old Columns into `conversions`
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'marketing_outreach_leads' 
          AND column_name = 'conversion_events'
    ) THEN
        UPDATE public.marketing_outreach_leads
           SET conversions = jsonb_build_object(
               'summary', CASE WHEN jsonb_typeof(conversion_summary) = 'object' THEN conversion_summary ELSE '{}'::jsonb END,
               'events',  CASE WHEN jsonb_typeof(conversion_events) = 'array' THEN conversion_events ELSE '[]'::jsonb END
           )
         WHERE (conversion_events IS NOT NULL AND conversion_events <> '[]'::jsonb)
            OR (conversion_summary IS NOT NULL AND conversion_summary <> '{}'::jsonb);
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Drop Old Constraints, Old Index, and Old Columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.marketing_outreach_leads 
    DROP CONSTRAINT IF EXISTS marketing_outreach_leads_conversion_events_is_array,
    DROP CONSTRAINT IF EXISTS marketing_outreach_leads_conversion_summary_is_object;

DROP INDEX IF EXISTS public.idx_marketing_outreach_leads_conversion_events_gin;

ALTER TABLE public.marketing_outreach_leads
    DROP COLUMN IF EXISTS conversion_events,
    DROP COLUMN IF EXISTS conversion_summary;

-- -----------------------------------------------------------------------------
-- 4. Add Strict Constraint on Unified `conversions` Column
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'marketing_outreach_leads_conversions_is_object'
    ) THEN
        ALTER TABLE public.marketing_outreach_leads 
        ADD CONSTRAINT marketing_outreach_leads_conversions_is_object 
        CHECK (
            jsonb_typeof(conversions) = 'object'
            AND jsonb_typeof(conversions -> 'summary') = 'object'
            AND jsonb_typeof(conversions -> 'events') = 'array'
        );
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Create GIN Index for Fast Event & Idempotency Lookups
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_marketing_outreach_leads_conversions_gin
    ON public.marketing_outreach_leads USING gin (conversions);

-- -----------------------------------------------------------------------------
-- 6. Update Pre-Write Trigger to Validate `conversions`
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

    -- Ensure conversions is valid { "summary": {}, "events": [] }
    IF NEW.conversions IS NULL OR jsonb_typeof(NEW.conversions) <> 'object' THEN
        NEW.conversions = '{"summary": {}, "events": []}'::jsonb;
    ELSE
        IF NEW.conversions -> 'summary' IS NULL OR jsonb_typeof(NEW.conversions -> 'summary') <> 'object' THEN
            NEW.conversions = jsonb_set(NEW.conversions, '{summary}', '{}'::jsonb);
        END IF;
        IF NEW.conversions -> 'events' IS NULL OR jsonb_typeof(NEW.conversions -> 'events') <> 'array' THEN
            NEW.conversions = jsonb_set(NEW.conversions, '{events}', '[]'::jsonb);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Update RPC: Record Conversion Event (Atomic + Row-Locked Idempotent Ingestion)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_record_conversion_event(
    p_lead_id uuid,
    p_event   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_events        jsonb;
    v_summary       jsonb;
    v_type          text;
    v_idemp_key     text;
    v_source_id     text;
    v_at            text;
    v_ts            timestamptz;
    v_user_id       text;
    v_user_email    text;
    v_page          text;
    v_amount_num    numeric;
    v_submission_id text;
    v_new_event     jsonb;
BEGIN
    IF p_lead_id IS NULL THEN
        RAISE EXCEPTION 'p_lead_id is required';
    END IF;

    IF p_event IS NULL OR jsonb_typeof(p_event) <> 'object' THEN
        RAISE EXCEPTION 'p_event must be a JSON object';
    END IF;

    v_type := lower(btrim(COALESCE(p_event ->> 'type', p_event ->> 'event_type', '')));
    IF v_type NOT IN ('page_visit', 'signup', 'submission', 'checkout', 'purchase') THEN
        RAISE EXCEPTION 'Invalid event type: "%". Allowed types: page_visit, signup, submission, checkout, purchase', v_type;
    END IF;

    -- Extract identifiers for idempotency
    v_idemp_key := NULLIF(btrim(p_event ->> 'idempotency_key'), '');
    v_source_id := NULLIF(btrim(COALESCE(p_event ->> 'id', p_event ->> 'source_event_id')), '');

    -- Row lock serializes concurrent writes per lead
    SELECT 
        CASE WHEN jsonb_typeof(l.conversions -> 'events') = 'array'
             THEN l.conversions -> 'events'
             ELSE '[]'::jsonb END,
        CASE WHEN jsonb_typeof(l.conversions -> 'summary') = 'object'
             THEN l.conversions -> 'summary'
             ELSE '{}'::jsonb END
      INTO v_events, v_summary
      FROM public.marketing_outreach_leads AS l
     WHERE l.id = p_lead_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'not_found',
            'message', format('marketing_outreach_leads row %s not found', p_lead_id)
        );
    END IF;

    -- Idempotency check: skip if duplicate event
    IF (v_idemp_key IS NOT NULL AND v_events @> jsonb_build_array(jsonb_build_object('idempotency_key', v_idemp_key)))
       OR (v_source_id IS NOT NULL AND v_events @> jsonb_build_array(jsonb_build_object('id', v_source_id))) THEN
        RETURN jsonb_build_object(
            'status', 'duplicate',
            'lead_id', p_lead_id,
            'event_type', v_type,
            'idempotency_key', v_idemp_key
        );
    END IF;

    -- Parse or normalize timestamp (UTC ISO-8601)
    BEGIN
        v_ts := COALESCE(NULLIF(p_event ->> 'at', '')::timestamptz, NULLIF(p_event ->> 'created_at', '')::timestamptz, now());
    EXCEPTION
        WHEN invalid_datetime_format OR datetime_field_overflow THEN
            v_ts := now();
    END;
    v_at := to_char(v_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

    -- Extract common fields
    v_user_id       := NULLIF(btrim(COALESCE(p_event ->> 'user_id', p_event -> 'data' ->> 'user_id')), '');
    v_user_email    := NULLIF(lower(btrim(COALESCE(p_event ->> 'user_email', p_event -> 'data' ->> 'email'))), '');
    v_page          := NULLIF(btrim(COALESCE(p_event ->> 'page', p_event ->> 'page_url')), '');
    v_submission_id := NULLIF(btrim(COALESCE(p_event ->> 'submission_id', p_event -> 'data' ->> 'submission_id')), '');

    -- Build normalized event object
    v_new_event := jsonb_build_object(
        'id',              COALESCE(v_source_id, gen_random_uuid()::text),
        'type',            v_type,
        'at',              v_at,
        'session_id',      NULLIF(btrim(p_event ->> 'session_id'), ''),
        'user_id',         v_user_id,
        'user_email',      v_user_email,
        'page',            v_page,
        'utm_source',      NULLIF(btrim(COALESCE(p_event ->> 'utm_source', p_event -> 'data' ->> 'utm_source')), ''),
        'utm_medium',      NULLIF(btrim(COALESCE(p_event ->> 'utm_medium', p_event -> 'data' ->> 'utm_medium')), ''),
        'utm_campaign',    NULLIF(btrim(COALESCE(p_event ->> 'utm_campaign', p_event -> 'data' ->> 'utm_campaign')), ''),
        'utm_content',     NULLIF(btrim(COALESCE(p_event ->> 'utm_content', p_event -> 'data' ->> 'utm_content')), ''),
        'utm_term',        NULLIF(btrim(COALESCE(p_event ->> 'utm_term', p_event -> 'data' ->> 'utm_term')), ''),
        'data',            COALESCE(p_event -> 'data', '{}'::jsonb),
        'idempotency_key', v_idemp_key
    );

    -- Append event to the chronological list
    v_events := v_events || jsonb_build_array(v_new_event);

    -- Update summary roll-ups
    IF v_user_id IS NOT NULL AND COALESCE(v_summary ->> 'toolbit_user_id', '') = '' THEN
        v_summary := jsonb_set(v_summary, '{toolbit_user_id}', to_jsonb(v_user_id));
    END IF;
    IF v_user_email IS NOT NULL AND COALESCE(v_summary ->> 'toolbit_user_email', '') = '' THEN
        v_summary := jsonb_set(v_summary, '{toolbit_user_email}', to_jsonb(v_user_email));
    END IF;

    IF v_type = 'page_visit' THEN
        v_summary := v_summary || jsonb_build_object(
            'visit_count',    COALESCE((v_summary ->> 'visit_count')::int, 0) + 1,
            'first_visit_at', COALESCE(v_summary ->> 'first_visit_at', v_at),
            'last_visit_at',  v_at
        );
    ELSIF v_type = 'signup' THEN
        v_summary := v_summary || jsonb_build_object(
            'signed_up',    true,
            'signed_up_at', COALESCE(v_summary ->> 'signed_up_at', v_at)
        );
    ELSIF v_type = 'submission' THEN
        v_summary := v_summary || jsonb_build_object(
            'submitted',          true,
            'submitted_at',       COALESCE(v_summary ->> 'submitted_at', v_at),
            'submission_count',   COALESCE((v_summary ->> 'submission_count')::int, 0) + 1,
            'last_submission_id', COALESCE(v_submission_id, v_summary ->> 'last_submission_id')
        );
    ELSIF v_type = 'checkout' THEN
        v_summary := v_summary || jsonb_build_object(
            'checked_out',      true,
            'last_checkout_at', v_at
        );
    ELSIF v_type = 'purchase' THEN
        BEGIN
            v_amount_num := COALESCE(
                NULLIF(p_event ->> 'amount_usd', '')::numeric,
                NULLIF(p_event -> 'data' ->> 'amount_usd', '')::numeric,
                0
            );
        EXCEPTION
            WHEN OTHERS THEN
                v_amount_num := 0;
        END;

        v_summary := v_summary || jsonb_build_object(
            'purchased',       true,
            'purchased_at',    COALESCE(v_summary ->> 'purchased_at', v_at),
            'purchase_count',  COALESCE((v_summary ->> 'purchase_count')::int, 0) + 1,
            'total_spent_usd', COALESCE((v_summary ->> 'total_spent_usd')::numeric, 0) + v_amount_num
        );
    END IF;

    -- Commit update into single unified `conversions` column
    UPDATE public.marketing_outreach_leads
       SET conversions = jsonb_build_object(
               'summary', v_summary,
               'events',  v_events
           ),
           updated_at  = now()
     WHERE id = p_lead_id;

    RETURN jsonb_build_object(
        'status',          'processed',
        'lead_id',         p_lead_id,
        'event_type',      v_type,
        'idempotency_key', v_idemp_key
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Permissions & Grants (Strict Least Privilege)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.marketing_record_conversion_event(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_record_conversion_event(uuid, jsonb) TO service_role;

COMMENT ON COLUMN public.marketing_outreach_leads.conversions IS
    'Unified conversion tracking: { "summary": { visit_count, signed_up, submitted, purchased, total_spent_usd }, "events": [ { id, type, at, page, data } ] }';

COMMENT ON FUNCTION public.marketing_record_conversion_event(uuid, jsonb) IS
    'Atomically appends a website conversion event to the lead record with row locking, idempotency check, and conversions.summary roll-up. service_role only.';

NOTIFY pgrst, 'reload schema';

COMMIT;
