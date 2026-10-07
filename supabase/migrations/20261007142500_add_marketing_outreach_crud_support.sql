-- =============================================================================
-- Migration: 20261007142500_add_marketing_outreach_crud_support.sql
-- Description:
--   Supports comprehensive CRUD operations on public.marketing_outreach_leads.
--   - Adds targeted index for fast tool_name lookup and sorting
--   - Adds atomic RPC public.marketing_bulk_delete_leads(uuid[]) for bulk deletions
--   - Verifies admin RLS policies for complete CRUD (insert, update, delete)
--
--   Idempotent and safe to execute on production environments.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Performance Indexes for Search and Sorting
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_marketing_outreach_leads_tool_name
    ON public.marketing_outreach_leads (tool_name);

CREATE INDEX IF NOT EXISTS idx_marketing_outreach_leads_created_at_desc
    ON public.marketing_outreach_leads (created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. Atomic Bulk Deletion RPC
--    Allows administrators to safely and efficiently delete multiple leads in
--    a single database roundtrip while respecting admin authorization.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_bulk_delete_leads(p_lead_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    deleted_count integer := 0;
BEGIN
    -- Strict Admin Authorization Check
    IF NOT (SELECT public.is_admin()) THEN
        RAISE EXCEPTION 'Access Denied: Only administrators can delete marketing outreach leads.';
    END IF;

    IF p_lead_ids IS NULL OR array_length(p_lead_ids, 1) = 0 THEN
        RETURN 0;
    END IF;

    DELETE FROM public.marketing_outreach_leads
     WHERE id = ANY(p_lead_ids);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.marketing_bulk_delete_leads(uuid[]) IS
    'Atomically deletes multiple marketing outreach leads by ID. Restricted to administrators.';

-- -----------------------------------------------------------------------------
-- 3. Row-Level Security (RLS) Policy Verification
-- -----------------------------------------------------------------------------
ALTER TABLE public.marketing_outreach_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_marketing_outreach_leads ON public.marketing_outreach_leads;
CREATE POLICY admin_all_marketing_outreach_leads 
    ON public.marketing_outreach_leads
    FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

COMMIT;
