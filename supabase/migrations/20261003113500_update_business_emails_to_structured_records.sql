-- =============================================================================
-- Migration: 20261003113500_update_business_emails_to_structured_records.sql
-- Description: Upgrade business_emails JSONB value from simple status strings
--              to clean, structured email records:
--              {
--                "alex@startup.ai": {
--                  "status": "undeliverable",
--                  "resend_status": "bounced",
--                  "bounce_reason": "550 User unknown",
--                  "last_bounced_at": "2026-10-03T11:00:00Z",
--                  "last_resend_id": "re_abc123"
--                }
--              }
--              - Retains primary email ordering via object key insertion order
--              - Omits empty/null fields to keep storage lean and clean
--              - Integrates with Resend webhook to auto-mark bounced emails as undeliverable
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Update Trigger FIRST: marketing_lead_before_write()
--    Ensures zero unnecessary fields and normalizes both string & object inputs.
--    Must be replaced before data update so the trigger handles and normalizes
--    scalar string values into clean structured objects instead of reverting them.
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
-- 2. In-place Data Upgrade: Convert any scalar string status to { "status": "..." }
--    Since the new trigger is active, this query fires the trigger which
--    automatically normalizes all scalar strings to clean structured objects.
-- -----------------------------------------------------------------------------
UPDATE public.marketing_outreach_leads
   SET business_emails = business_emails
 WHERE business_emails <> '{}'::jsonb
   AND EXISTS (
       SELECT 1
         FROM jsonb_each(business_emails) AS probe(k, v)
        WHERE jsonb_typeof(probe.v) = 'string'
   );

-- -----------------------------------------------------------------------------
-- 3. Update RPC: marketing_update_outbound_statuses(p_updates jsonb)
--    When Resend webhook delivers bounce/delivery events, updates BOTH
--    conversation_history AND business_emails[recipient] atomically.
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
    v_new_hist jsonb;
    v_new_mail jsonb;
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

    -- Candidate leads via GIN index on conversation_history
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
                    ELSE '[]'::jsonb END AS history,
               CASE WHEN jsonb_typeof(l.business_emails) = 'object'
                    THEN l.business_emails
                    ELSE '{}'::jsonb END AS emails
          FROM public.marketing_outreach_leads AS l
         WHERE l.id = ANY (v_lead_ids)
         ORDER BY l.id
           FOR UPDATE
    LOOP
        -- 1. Update conversation_history
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
                                                                               WHEN 'failed'    THEN true
                                                                               WHEN 'bounced'   THEN COALESCE(m.msg ->> 'status', '') <> 'failed'
                                                                               WHEN 'delivered' THEN COALESCE(m.msg ->> 'status', '') NOT IN ('bounced', 'failed')
                                                                               WHEN 'sent'      THEN COALESCE(m.msg ->> 'status', '') NOT IN ('delivered', 'bounced', 'failed')
                                                                               ELSE false
                                                                           END
                                                                          )
                                                                     THEN jsonb_build_object('status', upd ->> 'status')
                                                                     ELSE '{}'::jsonb
                                                                 END
                                                              || CASE
                                                                     WHEN upd ->> 'message_id' IS NOT NULL
                                                                      AND (m.msg ->> 'message_id' IS NULL OR m.msg ->> 'message_id' = '')
                                                                     THEN jsonb_build_object('message_id', upd ->> 'message_id')
                                                                     ELSE '{}'::jsonb
                                                                 END
                                                              || CASE
                                                                     WHEN upd ->> 'error' IS NOT NULL
                                                                      AND upd ->> 'status' IN ('failed', 'bounced')
                                                                     THEN jsonb_build_object('error', upd ->> 'error')
                                                                     ELSE '{}'::jsonb
                                                                 END
                                                         FROM (SELECT v_map -> (m.msg ->> 'resend_email_id') AS upd) AS u
                                                   )
                                                   ELSE m.msg
                                               END
                                               ORDER BY msg_idx
                                           ), '[]'::jsonb) AS list
                                      FROM jsonb_array_elements(t.thread -> 'messages') WITH ORDINALITY AS m(msg, msg_idx)
                              ) AS updated_msgs
                       )
                       ELSE t.thread
                   END
                   ORDER BY thread_idx
               ), '[]'::jsonb)
          INTO v_new_hist
          FROM jsonb_array_elements(v_lead.history) WITH ORDINALITY AS t(thread, thread_idx);

        -- 2. Update business_emails: Tag bounced or delivered recipients
        v_new_mail := v_lead.emails;
        IF v_new_mail <> '{}'::jsonb THEN
            SELECT COALESCE(
                jsonb_object_agg(
                    item.email_key,
                    CASE
                        -- Found an active event in this batch matching this recipient email
                        WHEN evt.upd IS NOT NULL THEN
                            (
                                SELECT item.existing_record
                                       || CASE
                                              WHEN evt.upd ->> 'status' IN ('bounced', 'failed') THEN
                                                  jsonb_build_object(
                                                      'status',          'undeliverable',
                                                      'resend_status',   evt.upd ->> 'status',
                                                      'bounce_reason',   COALESCE(evt.upd ->> 'error', 'Mailbox delivery failed'),
                                                      'last_bounced_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                                      'last_resend_id',  evt.resend_id
                                                  )
                                              WHEN evt.upd ->> 'status' = 'delivered' THEN
                                                  jsonb_build_object(
                                                      'status',            CASE
                                                                               WHEN item.existing_record ->> 'status' = 'undeliverable'
                                                                               THEN 'undeliverable'
                                                                               ELSE 'deliverable'
                                                                           END,
                                                      'resend_status',     'delivered',
                                                      'last_delivered_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                                      'last_resend_id',    evt.resend_id
                                                  )
                                              WHEN evt.upd ->> 'status' = 'sent' THEN
                                                  jsonb_build_object(
                                                      'resend_status', evt.upd ->> 'status',
                                                      'last_sent_at',  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                                      'last_resend_id', evt.resend_id
                                                  )
                                              ELSE '{}'::jsonb
                                          END
                            )
                        ELSE
                            item.existing_record
                    END
                ),
                '{}'::jsonb
            )
            INTO v_new_mail
            FROM (
                SELECT k.key AS email_key,
                       CASE
                           WHEN jsonb_typeof(k.value) = 'object' THEN k.value
                           ELSE jsonb_build_object('status', COALESCE(k.value #>> '{}', 'unverified'))
                       END AS existing_record
                  FROM jsonb_each(v_lead.emails) AS k(key, value)
            ) AS item
            LEFT JOIN LATERAL (
                SELECT k_id.resend_id, v_map -> k_id.resend_id AS upd
                  FROM jsonb_object_keys(v_map) AS k_id(resend_id)
                 WHERE (v_map -> k_id.resend_id ->> 'recipient') = item.email_key
                 LIMIT 1
            ) AS evt ON true;
        END IF;

        -- 3. Persist update on lead
        UPDATE public.marketing_outreach_leads
           SET conversation_history = v_new_hist,
               business_emails      = v_new_mail,
               status = CASE
                            WHEN v_lead.status = 'pending'
                             AND EXISTS (
                                 SELECT 1
                                   FROM jsonb_array_elements(v_new_hist) AS th(thread)
                                  CROSS JOIN LATERAL jsonb_array_elements(
                                         CASE WHEN jsonb_typeof(th.thread -> 'messages') = 'array'
                                              THEN th.thread -> 'messages' ELSE '[]'::jsonb END
                                      ) AS m(msg)
                                  WHERE m.msg ->> 'direction' = 'outbound'
                                    AND m.msg ->> 'status' = 'delivered'
                             )
                            THEN 'emailed'
                            ELSE v_lead.status
                        END
         WHERE id = v_lead.id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Update CRUD RPC Helpers: Add, Update, and Update Status
-- -----------------------------------------------------------------------------
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
               jsonb_build_object(
                   'status',
                   CASE 
                       WHEN lower(btrim(COALESCE(p_status, ''))) IN ('deliverable', 'undeliverable', 'unverified') 
                       THEN lower(btrim(p_status)) 
                       ELSE 'unverified' 
                   END
               )
           ),
           updated_at = now()
     WHERE id = p_lead_id
       AND NULLIF(btrim(p_email), '') IS NOT NULL
    RETURNING business_emails;
$$;

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
               (
                   SELECT CASE
                              WHEN jsonb_typeof(orig) = 'object' THEN
                                  orig || CASE
                                              WHEN NULLIF(lower(btrim(p_status)), '') IS NOT NULL
                                               AND lower(btrim(p_status)) IN ('deliverable', 'undeliverable', 'unverified')
                                              THEN jsonb_build_object('status', lower(btrim(p_status)))
                                              ELSE '{}'::jsonb
                                          END
                              ELSE
                                  jsonb_build_object(
                                      'status',
                                      COALESCE(
                                          NULLIF(lower(btrim(p_status)), ''),
                                          NULLIF(lower(btrim(orig #>> '{}')), ''),
                                          'unverified'
                                      )
                                  )
                          END
                     FROM (SELECT business_emails -> lower(btrim(p_old_email)) AS orig) AS o
               )
           ),
           updated_at = now()
     WHERE id = p_lead_id
       AND NULLIF(btrim(p_new_email), '') IS NOT NULL
    RETURNING business_emails;
$$;

CREATE OR REPLACE FUNCTION public.marketing_update_lead_email_status(
    p_lead_id uuid,
    p_email text,
    p_status text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE public.marketing_outreach_leads
       SET business_emails = business_emails || jsonb_build_object(
               lower(btrim(p_email)),
               (
                   SELECT CASE
                              WHEN jsonb_typeof(orig) = 'object' THEN
                                  orig || jsonb_build_object(
                                      'status',
                                      CASE
                                          WHEN lower(btrim(p_status)) IN ('deliverable', 'undeliverable', 'unverified')
                                          THEN lower(btrim(p_status))
                                          ELSE 'unverified'
                                      END
                                  )
                              ELSE
                                  jsonb_build_object(
                                      'status',
                                      CASE
                                          WHEN lower(btrim(p_status)) IN ('deliverable', 'undeliverable', 'unverified')
                                          THEN lower(btrim(p_status))
                                          ELSE 'unverified'
                                      END
                                  )
                          END
                     FROM (SELECT business_emails -> lower(btrim(p_email)) AS orig) AS o
               )
           ),
           updated_at = now()
     WHERE id = p_lead_id
       AND business_emails ? lower(btrim(p_email))
    RETURNING business_emails;
$$;

-- -----------------------------------------------------------------------------
-- 5. Update Computed Stats: marketing_outreach_lead_stats()
--    Handles both object { "status": "..." } and legacy string "..."
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
              AND jsonb_path_exists(l.business_emails, '$.* ? (@ == "deliverable" || @.status == "deliverable")')
        ),
        'with_unverified',   count(*) FILTER (
            WHERE l.business_emails <> '{}'::jsonb
              AND jsonb_path_exists(l.business_emails, '$.* ? (@ == "unverified" || @.status == "unverified")')
        ),
        'pending',           count(*) FILTER (WHERE l.status = 'pending'),
        'emailed',           count(*) FILTER (WHERE l.status = 'emailed'),
        'replied',           count(*) FILTER (WHERE l.status = 'replied')
    )
      FROM public.marketing_outreach_leads AS l;
$$;

-- -----------------------------------------------------------------------------
-- 6. Security Grants (Least Privilege)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.marketing_update_outbound_statuses(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_add_lead_email(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_update_lead_email(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_update_lead_email_status(uuid, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.marketing_update_outbound_statuses(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_add_lead_email(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_update_lead_email(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_update_lead_email_status(uuid, text, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Documentation
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.marketing_outreach_leads.business_emails IS 
    'JSONB map of email addresses to structured records: {"email@domain.com": {"status": "unverified" | "deliverable" | "undeliverable", "resend_status"?: string, "bounce_reason"?: string, "last_bounced_at"?: string, "last_sent_at"?: string}}. Default: {}';

NOTIFY pgrst, 'reload schema';

COMMIT;
