-- =============================================================================
-- Migration: 20261003001500_convert_business_emails_to_jsonb.sql
-- Description: Convert business_emails from text[] to jsonb key-value map:
--              { "alex@startup.ai": "unverified", "support@startup.ai": "deliverable" }
--              Status values: 'unverified' (default) | 'deliverable' | 'undeliverable'
--              Default column value: '{}'::jsonb
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Helper function for clean data conversion during ALTER TABLE
--    (Defaults all existing unchecked lead emails to 'unverified')
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._migrate_emails_to_jsonb_kv(p_emails text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT COALESCE(
        (
            SELECT jsonb_object_agg(sub.clean_email, 'unverified')
            FROM (
                SELECT DISTINCT lower(btrim(e)) AS clean_email
                FROM unnest(p_emails) AS e
                WHERE NULLIF(btrim(e), '') IS NOT NULL
            ) sub
        ),
        '{}'::jsonb
    );
$$;

-- -----------------------------------------------------------------------------
-- 2. Drop dependent computed functions and old GIN index
--    (PostgreSQL requires dropping composite-type dependencies before column alter)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.conversation_summary(public.marketing_outreach_leads);
DROP FUNCTION IF EXISTS public.outreach_send_history(public.marketing_outreach_leads);
DROP INDEX IF EXISTS public.idx_marketing_outreach_leads_business_emails_gin;

-- -----------------------------------------------------------------------------
-- 3. Alter column business_emails from text[] to jsonb with default '{}'::jsonb
-- -----------------------------------------------------------------------------
ALTER TABLE public.marketing_outreach_leads 
    ALTER COLUMN business_emails DROP DEFAULT,
    ALTER COLUMN business_emails TYPE jsonb USING public._migrate_emails_to_jsonb_kv(business_emails),
    ALTER COLUMN business_emails SET DEFAULT '{}'::jsonb,
    ALTER COLUMN business_emails SET NOT NULL;

DROP FUNCTION IF EXISTS public._migrate_emails_to_jsonb_kv(text[]);

-- -----------------------------------------------------------------------------
-- 4. Recreate GIN index on business_emails for fast ? 'email' lookups
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_marketing_outreach_leads_business_emails_gin
    ON public.marketing_outreach_leads USING gin (business_emails);

-- -----------------------------------------------------------------------------
-- 5. Update EXISTING Pre-Write Trigger Function (marketing_lead_before_write)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_lead_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();

    -- Fast-path: if NULL or already empty object, assign '{}' and skip subquery
    IF NEW.business_emails IS NULL OR NEW.business_emails = '{}'::jsonb THEN
        NEW.business_emails = '{}'::jsonb;
    ELSIF jsonb_typeof(NEW.business_emails) = 'object' THEN
        SELECT COALESCE(
            jsonb_object_agg(
                lower(btrim(k.key)),
                CASE 
                    WHEN lower(btrim(k.value #>> '{}')) IN ('deliverable', 'undeliverable', 'unverified') 
                    THEN lower(btrim(k.value #>> '{}'))
                    ELSE 'unverified'
                END
            ),
            '{}'::jsonb
        ) INTO NEW.business_emails
        FROM jsonb_each(NEW.business_emails) AS k(key, value)
        WHERE NULLIF(btrim(k.key), '') IS NOT NULL;
    ELSIF jsonb_typeof(NEW.business_emails) = 'array' THEN
        -- Defensive fallback: if code passes an array, convert to KV object with 'unverified'
        SELECT COALESCE(
            jsonb_object_agg(lower(btrim(elem #>> '{}')), 'unverified'),
            '{}'::jsonb
        ) INTO NEW.business_emails
        FROM jsonb_array_elements(NEW.business_emails) AS elem
        WHERE NULLIF(btrim(elem #>> '{}'), '') IS NOT NULL;
    ELSE
        NEW.business_emails = '{}'::jsonb;
    END IF;

    -- Valid JSON structure guards
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
-- 6. Recreate Computed Field Functions (PostgREST API)
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
                        THEN p_lead.conversation_history ELSE '[]'::jsonb END
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
                     THEN th.thread -> 'messages' ELSE '[]'::jsonb END
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
                        THEN p_lead.conversation_history ELSE '[]'::jsonb END
               ) AS t(thread)
         WHERE jsonb_typeof(t.thread) = 'object'
    ),
    msgs AS (
        SELECT m.msg,
               NULLIF(lower(btrim(COALESCE(th.thread ->> 'email', ''))), '') AS thread_email
          FROM threads AS th
         CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(th.thread -> 'messages') = 'array'
                     THEN th.thread -> 'messages' ELSE '[]'::jsonb END
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
-- 7. Update EXISTING marketing_outreach_lead_stats() (optimized)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_outreach_lead_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'total',             count(*),
        'with_emails',       count(*) FILTER (WHERE l.business_emails <> '{}'::jsonb),
        'with_deliverable',  count(*) FILTER (
            WHERE l.business_emails <> '{}'::jsonb
              AND jsonb_path_exists(l.business_emails, '$.* ? (@ == "deliverable")')
        ),
        'with_unverified',   count(*) FILTER (
            WHERE l.business_emails <> '{}'::jsonb
              AND jsonb_path_exists(l.business_emails, '$.* ? (@ == "unverified")')
        ),
        'pending',           count(*) FILTER (WHERE l.status = 'pending'),
        'emailed',           count(*) FILTER (WHERE l.status = 'emailed'),
        'replied',           count(*) FILTER (WHERE l.status = 'replied')
    )
      FROM public.marketing_outreach_leads AS l;
$$;

-- -----------------------------------------------------------------------------
-- 8. Clean, Secure, High-Performance RPC Helpers (Atomic JSONB updates)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.marketing_add_lead_email(uuid, text);
DROP FUNCTION IF EXISTS public.marketing_add_lead_email(uuid, text, text);

CREATE OR REPLACE FUNCTION public.marketing_add_lead_email(
    p_lead_id uuid,
    p_email text,
    p_status text DEFAULT 'unverified'
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE public.marketing_outreach_leads
       SET business_emails = business_emails || jsonb_build_object(
               lower(btrim(p_email)), 
               CASE 
                   WHEN lower(btrim(COALESCE(p_status, ''))) IN ('deliverable', 'undeliverable', 'unverified') 
                   THEN lower(btrim(p_status)) 
                   ELSE 'unverified' 
               END
           ),
           updated_at = now()
     WHERE id = p_lead_id
       AND NULLIF(btrim(p_email), '') IS NOT NULL
    RETURNING business_emails;
$$;

DROP FUNCTION IF EXISTS public.marketing_delete_lead_email(uuid, text);

CREATE OR REPLACE FUNCTION public.marketing_delete_lead_email(
    p_lead_id uuid,
    p_email text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE public.marketing_outreach_leads
       SET business_emails = business_emails - lower(btrim(p_email)),
           updated_at = now()
     WHERE id = p_lead_id
    RETURNING business_emails;
$$;

DROP FUNCTION IF EXISTS public.marketing_update_lead_email(uuid, text, text);
DROP FUNCTION IF EXISTS public.marketing_update_lead_email(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.marketing_update_lead_email(
    p_lead_id uuid,
    p_old_email text,
    p_new_email text,
    p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE public.marketing_outreach_leads
       SET business_emails = (business_emails - lower(btrim(p_old_email))) || jsonb_build_object(
               lower(btrim(p_new_email)), 
               COALESCE(
                   NULLIF(lower(btrim(p_status)), ''),
                   business_emails ->> lower(btrim(p_old_email)),
                   'unverified'
               )
           ),
           updated_at = now()
     WHERE id = p_lead_id
       AND NULLIF(btrim(p_new_email), '') IS NOT NULL
    RETURNING business_emails;
$$;

-- -----------------------------------------------------------------------------
-- 9. Update EXISTING RPC: marketing_ingest_inbound_email (? 'email' match)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_ingest_inbound_email(
    p_from_email   text,
    p_message_id   text,
    p_in_reply_to  text,
    p_references   text[],
    p_message      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_from         text;
    v_resend_id    text;
    v_msg_id       text;
    v_in_reply_to  text;
    v_lead_id      uuid;
    v_thread_email text;
    v_match_type   text;
    v_inserted     boolean := false;
    v_promoted     boolean := false;
BEGIN
    v_from        := lower(btrim(COALESCE(p_from_email, '')));
    v_resend_id   := NULLIF(btrim(COALESCE(p_message ->> 'resend_email_id', '')), '');
    v_msg_id      := NULLIF(btrim(COALESCE(p_message_id, '')), '');
    v_in_reply_to := NULLIF(btrim(COALESCE(p_in_reply_to, '')), '');

    IF v_from = '' AND v_resend_id IS NULL AND v_msg_id IS NULL AND v_in_reply_to IS NULL THEN
        RETURN jsonb_build_object('status', 'unmatched', 'reason', 'missing_identifiers');
    END IF;

    -- a) In-Reply-To / References match
    IF v_lead_id IS NULL AND (v_in_reply_to IS NOT NULL OR array_length(p_references, 1) > 0) THEN
        SELECT l.id, lower(btrim(t.thread ->> 'email'))
          INTO v_lead_id, v_thread_email
          FROM public.marketing_outreach_leads AS l
         CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(l.conversation_history) = 'array'
                     THEN l.conversation_history ELSE '[]'::jsonb END
             ) AS t(thread)
         CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(t.thread -> 'messages') = 'array'
                     THEN t.thread -> 'messages' ELSE '[]'::jsonb END
             ) AS m(msg)
         WHERE (v_in_reply_to IS NOT NULL AND m.msg ->> 'message_id' = v_in_reply_to)
            OR (array_length(p_references, 1) > 0 AND m.msg ->> 'message_id' = ANY(p_references))
         ORDER BY l.updated_at DESC
         LIMIT 1;

        IF v_lead_id IS NOT NULL THEN
            v_match_type := 'message_id';
        END IF;
    END IF;

    -- b) Thread email match
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

    -- c) Business emails matching (fast GIN index lookup: business_emails ? v_from)
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
         WHERE l.business_emails ? v_from
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
-- 10. Strict Security Grants (Least Privilege)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.conversation_summary(public.marketing_outreach_leads)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_send_history(public.marketing_outreach_leads)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marketing_outreach_lead_stats()                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_add_lead_email(uuid, text, text)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_delete_lead_email(uuid, text)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_update_lead_email(uuid, text, text, text)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_ingest_inbound_email(text, text, text, text[], jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.conversation_summary(public.marketing_outreach_leads)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_send_history(public.marketing_outreach_leads)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marketing_outreach_lead_stats()                        TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_add_lead_email(uuid, text, text)             TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_delete_lead_email(uuid, text)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_update_lead_email(uuid, text, text, text)    TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_ingest_inbound_email(text, text, text, text[], jsonb) TO service_role;

-- -----------------------------------------------------------------------------
-- 11. Column Documentation & PostgREST Schema Cache Reload
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.marketing_outreach_leads.business_emails IS 
    'JSONB key-value map of emails to deliverability status: {"email@domain.com": "unverified" | "deliverable" | "undeliverable"}. Default: {}';

NOTIFY pgrst, 'reload schema';

COMMIT;
