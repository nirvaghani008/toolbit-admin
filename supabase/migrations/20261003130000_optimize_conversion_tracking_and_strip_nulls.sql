-- =============================================================================
-- Migration: 20261003130000_optimize_conversion_tracking_and_strip_nulls.sql
-- Description:
--   1. Optimizes conversion tracking in public.marketing_outreach_leads.conversions:
--      - Strips all null fields from events and summary (no null pollution).
--      - Removes redundant UTM parameters and session_id from the `data` sub-object
--        so attribution fields are stored strictly once on the canonical event object.
--      - Eliminates empty `data: {}` when no action-specific payload exists.
--      - Supports 'login' event type alongside 'signup'.
--      - Marks `signed_up: true` in summary for both signup and login events,
--        while omitting `signed_up_at` and `last_login_at` timestamps per requirements.
--   2. Updates public.marketing_record_conversion_event() RPC.
--   3. Sanitizes all existing conversion records in public.marketing_outreach_leads.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Update RPC: public.marketing_record_conversion_event()
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
    v_session_id    text;
    v_utm_source    text;
    v_utm_medium    text;
    v_utm_campaign  text;
    v_utm_content   text;
    v_utm_term      text;
    v_amount_num    numeric;
    v_submission_id text;
    v_clean_data    jsonb;
    v_new_event     jsonb;
BEGIN
    IF p_lead_id IS NULL THEN
        RAISE EXCEPTION 'p_lead_id is required';
    END IF;

    IF p_event IS NULL OR jsonb_typeof(p_event) <> 'object' THEN
        RAISE EXCEPTION 'p_event must be a JSON object';
    END IF;

    -- Normalize event type (supports login, signup, page_visit, submission, checkout, purchase)
    v_type := lower(btrim(COALESCE(p_event ->> 'type', p_event ->> 'event_type', '')));
    IF v_type NOT IN ('page_visit', 'signup', 'login', 'submission', 'checkout', 'purchase') THEN
        RAISE EXCEPTION 'Invalid event type: "%". Allowed types: page_visit, signup, login, submission, checkout, purchase', v_type;
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

    -- Extract canonical fields from either top-level or data payload
    v_user_id       := NULLIF(btrim(COALESCE(p_event ->> 'user_id', p_event -> 'data' ->> 'user_id')), '');
    v_user_email    := NULLIF(lower(btrim(COALESCE(p_event ->> 'user_email', p_event -> 'data' ->> 'email', p_event -> 'data' ->> 'user_email'))), '');
    v_page          := NULLIF(btrim(COALESCE(p_event ->> 'page', p_event ->> 'page_url')), '');
    v_session_id    := NULLIF(btrim(COALESCE(p_event ->> 'session_id', p_event -> 'data' ->> 'session_id')), '');
    v_submission_id := NULLIF(btrim(COALESCE(p_event ->> 'submission_id', p_event -> 'data' ->> 'submission_id')), '');

    -- Extract canonical UTM attributes
    v_utm_source    := NULLIF(btrim(COALESCE(p_event ->> 'utm_source', p_event -> 'data' ->> 'utm_source')), '');
    v_utm_medium    := NULLIF(btrim(COALESCE(p_event ->> 'utm_medium', p_event -> 'data' ->> 'utm_medium')), '');
    v_utm_campaign  := NULLIF(btrim(COALESCE(p_event ->> 'utm_campaign', p_event -> 'data' ->> 'utm_campaign')), '');
    v_utm_content   := NULLIF(btrim(COALESCE(p_event ->> 'utm_content', p_event -> 'data' ->> 'utm_content')), '');
    v_utm_term      := NULLIF(btrim(COALESCE(p_event ->> 'utm_term', p_event -> 'data' ->> 'utm_term')), '');

    -- Clean data sub-object: remove redundant canonical keys so data only contains action-specific fields
    v_clean_data := COALESCE(p_event -> 'data', '{}'::jsonb);
    IF jsonb_typeof(v_clean_data) = 'object' THEN
        v_clean_data := v_clean_data
            - 'utm_source' - 'utm_medium' - 'utm_campaign' - 'utm_content' - 'utm_term'
            - 'session_id' - 'user_id' - 'user_email' - 'email' - 'page' - 'page_url';
        
        -- If action was login/signup and redundant with v_type, remove it
        IF v_clean_data ->> 'action' IN ('login', 'signup', 'oauth_signup', 'otp_verification') THEN
            v_clean_data := v_clean_data - 'action';
        END IF;
    ELSE
        v_clean_data := '{}'::jsonb;
    END IF;

    -- Build normalized event object with jsonb_strip_nulls
    -- This guarantees NO null keys (e.g. utm_content: null) are ever stored.
    v_new_event := jsonb_strip_nulls(jsonb_build_object(
        'id',              COALESCE(v_source_id, gen_random_uuid()::text),
        'type',            v_type,
        'at',              v_at,
        'session_id',      v_session_id,
        'user_id',         v_user_id,
        'user_email',      v_user_email,
        'page',            v_page,
        'utm_source',      v_utm_source,
        'utm_medium',      v_utm_medium,
        'utm_campaign',    v_utm_campaign,
        'utm_content',     v_utm_content,
        'utm_term',        v_utm_term,
        'idempotency_key', v_idemp_key,
        'data',            CASE WHEN v_clean_data <> '{}'::jsonb THEN v_clean_data ELSE NULL END
    ));

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
    ELSIF v_type IN ('signup', 'login') THEN
        -- Both signup and login mark the lead as a registered Toolbit user
        -- No signed_up_at or last_login_at timestamp stored in summary per requirements
        v_summary := v_summary || jsonb_build_object('signed_up', true);
        v_summary := v_summary - 'signed_up_at' - 'last_login_at';
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

    -- Strip any nulls and obsolete timestamps from summary
    v_summary := jsonb_strip_nulls(v_summary - 'signed_up_at' - 'last_login_at');

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

REVOKE ALL ON FUNCTION public.marketing_record_conversion_event(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_record_conversion_event(uuid, jsonb) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Data Migration: Sanitize Existing Leads in public.marketing_outreach_leads
--    - Strips all null keys from events and summary.
--    - Cleans redundant UTM and session parameters from `data`.
--    - Converts erroneously labeled `signup` events with `action: login` to `login`.
--    - Removes `signed_up_at` and `last_login_at` timestamps from `summary`.
-- -----------------------------------------------------------------------------
UPDATE public.marketing_outreach_leads l
   SET conversions = jsonb_build_object(
           'summary',
           jsonb_strip_nulls(
               (COALESCE(l.conversions -> 'summary', '{}'::jsonb)) - 'signed_up_at' - 'last_login_at'
           ),
           'events',
           COALESCE(
               (
                   SELECT jsonb_agg(
                       jsonb_strip_nulls(
                           jsonb_build_object(
                               'id',              NULLIF(btrim(evt.value ->> 'id'), ''),
                               'type',            CASE 
                                                      WHEN evt.value ->> 'type' = 'signup' AND evt.value -> 'data' ->> 'action' = 'login' 
                                                      THEN 'login' 
                                                      ELSE lower(btrim(COALESCE(evt.value ->> 'type', 'page_visit')))
                                                  END,
                               'at',              NULLIF(btrim(evt.value ->> 'at'), ''),
                               'session_id',      NULLIF(btrim(COALESCE(evt.value ->> 'session_id', evt.value -> 'data' ->> 'session_id')), ''),
                               'user_id',         NULLIF(btrim(COALESCE(evt.value ->> 'user_id', evt.value -> 'data' ->> 'user_id')), ''),
                               'user_email',      NULLIF(lower(btrim(COALESCE(evt.value ->> 'user_email', evt.value -> 'data' ->> 'email', evt.value -> 'data' ->> 'user_email'))), ''),
                               'page',            NULLIF(btrim(COALESCE(evt.value ->> 'page', evt.value ->> 'page_url')), ''),
                               'utm_source',      NULLIF(btrim(COALESCE(evt.value ->> 'utm_source', evt.value -> 'data' ->> 'utm_source')), ''),
                               'utm_medium',      NULLIF(btrim(COALESCE(evt.value ->> 'utm_medium', evt.value -> 'data' ->> 'utm_medium')), ''),
                               'utm_campaign',    NULLIF(btrim(COALESCE(evt.value ->> 'utm_campaign', evt.value -> 'data' ->> 'utm_campaign')), ''),
                               'utm_content',     NULLIF(btrim(COALESCE(evt.value ->> 'utm_content', evt.value -> 'data' ->> 'utm_content')), ''),
                               'utm_term',        NULLIF(btrim(COALESCE(evt.value ->> 'utm_term', evt.value -> 'data' ->> 'utm_term')), ''),
                               'idempotency_key', NULLIF(btrim(evt.value ->> 'idempotency_key'), ''),
                               'data',            CASE 
                                                      WHEN (
                                                          (COALESCE(evt.value -> 'data', '{}'::jsonb))
                                                          - 'utm_source' - 'utm_medium' - 'utm_campaign' - 'utm_content' - 'utm_term' 
                                                          - 'session_id' - 'user_id' - 'user_email' - 'email' - 'page' - 'page_url' - 'action'
                                                      ) <> '{}'::jsonb 
                                                      THEN (
                                                          (COALESCE(evt.value -> 'data', '{}'::jsonb))
                                                          - 'utm_source' - 'utm_medium' - 'utm_campaign' - 'utm_content' - 'utm_term' 
                                                          - 'session_id' - 'user_id' - 'user_email' - 'email' - 'page' - 'page_url' - 'action'
                                                      )
                                                      ELSE NULL 
                                                  END
                           )
                       )
                   )
                   FROM jsonb_array_elements(l.conversions -> 'events') WITH ORDINALITY AS evt(value, ord)
               ),
               '[]'::jsonb
           )
       ),
       updated_at = now()
 WHERE jsonb_typeof(l.conversions -> 'events') = 'array'
   AND jsonb_array_length(l.conversions -> 'events') > 0;

NOTIFY pgrst, 'reload schema';

COMMIT;
