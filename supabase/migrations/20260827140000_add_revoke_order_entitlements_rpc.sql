-- Migration: 20260827140000_add_revoke_order_entitlements_rpc.sql
-- Description: Atomically transitions an order to 'refunded' and revokes associated
--              entitlements across tools (ai_tools, ai_tool_submissions),
--              active advertisements (advertisement_tools), and guest posts (blog_posts)
--              aligned with site_settings page_setting_paid_plans specifications.

CREATE OR REPLACE FUNCTION public.revoke_order_entitlements(
  p_order_id uuid,
  p_refund_id text,
  p_refund_amount numeric,
  p_refund_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_order record;
  v_target_tool_id integer;
BEGIN
  -- 1. Lock and fetch order row to guarantee transactional consistency
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order record not found');
  END IF;

  IF v_order.status = 'refunded' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order has already been refunded');
  END IF;

  -- 2. Update Order to 'refunded' and clear pending manual deliverables
  UPDATE public.orders
  SET status = 'refunded',
      refund_id = p_refund_id,
      refund_amount = COALESCE(p_refund_amount, amount_usd),
      refund_reason = COALESCE(NULLIF(p_refund_reason, ''), 'Admin initiated refund'),
      refunded_at = now(),
      metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{pending_manual_fulfillment}',
        '[]'::jsonb
      ),
      updated_at = now()
  WHERE id = p_order_id;

  -- 3. Multi-tier resolution for target tool ID:
  -- Tier A: Direct ID from order metadata (common in update and ad orders)
  v_target_tool_id := NULLIF((v_order.metadata->>'tool_id'), '')::integer;

  -- Tier B: Direct tool_id on submission (common in update submissions)
  IF v_target_tool_id IS NULL THEN
    SELECT tool_id INTO v_target_tool_id
    FROM public.ai_tool_submissions
    WHERE (order_id = p_order_id OR order_number = v_order.order_number)
      AND tool_id IS NOT NULL
    LIMIT 1;
  END IF;

  -- Tier C: Match ai_tools via submission tool_url or domain
  -- (Necessary for launch tools because submission tool_id is NULL until approved)
  IF v_target_tool_id IS NULL THEN
    SELECT t.tool_id INTO v_target_tool_id
    FROM public.ai_tools t
    JOIN public.ai_tool_submissions s ON (s.order_id = p_order_id OR s.order_number = v_order.order_number)
    WHERE t.tool_url = s.tool_url
       OR (s.tool_site_url IS NOT NULL AND s.tool_site_url <> '' AND 
           split_part(regexp_replace(lower(coalesce(t.tool_site_url, '')), '^https?://(www\.)?', ''), '/', 1) =
           split_part(regexp_replace(lower(coalesce(s.tool_site_url, '')), '^https?://(www\.)?', ''), '/', 1))
    ORDER BY (t.tool_url = s.tool_url) DESC
    LIMIT 1;
  END IF;

  -- Tier D: Fallback match against orders.metadata tool_url or domain
  IF v_target_tool_id IS NULL AND (v_order.metadata->>'tool_url' IS NOT NULL OR v_order.metadata->>'tool_site_url' IS NOT NULL) THEN
    SELECT t.tool_id INTO v_target_tool_id
    FROM public.ai_tools t
    WHERE (v_order.metadata->>'tool_url' IS NOT NULL AND t.tool_url = (v_order.metadata->>'tool_url'))
       OR (v_order.metadata->>'tool_site_url' IS NOT NULL AND (v_order.metadata->>'tool_site_url') <> '' AND
           split_part(regexp_replace(lower(coalesce(t.tool_site_url, '')), '^https?://(www\.)?', ''), '/', 1) =
           split_part(regexp_replace(lower(coalesce(v_order.metadata->>'tool_site_url', '')), '^https?://(www\.)?', ''), '/', 1))
    LIMIT 1;
  END IF;

  -- 4. Revoke entitlements according to plan type
  -- Case A: ADVERTISEMENTS (paid_advertise_3_days, 7_days, 15_days)
  IF v_order.plan_id LIKE '%advertise%' THEN
    UPDATE public.advertisement_tools
    SET status = 'inactive',
        updated_at = now()
    WHERE order_id = p_order_id
       OR (v_target_tool_id IS NOT NULL AND tool_id = v_target_tool_id AND status = 'active');

  -- Case B: GUEST POSTS (paid_guest_post)
  ELSIF v_order.plan_id LIKE '%guest_post%' THEN
    UPDATE public.blog_posts
    SET status = 'draft',
        is_paid = false,
        is_featured = false,
        submission_tier = 'free_guest_post',
        updated_at = now()
    WHERE order_id = p_order_id
       OR (v_order.user_id IS NOT NULL AND author_id = v_order.user_id AND (v_order.metadata->>'title' IS NOT NULL AND title = (v_order.metadata->>'title')));

  -- Case C: TOOL LAUNCH OR UPDATE (paid_launch_tool, paid_update_tool)
  ELSIF v_order.plan_id LIKE '%launch_tool%' OR v_order.plan_id LIKE '%update_tool%' THEN
    -- Demote submission
    UPDATE public.ai_tool_submissions
    SET is_paid = false,
        submission_tier = CASE 
          WHEN v_order.plan_id LIKE '%update%' THEN 'free_update_tool' 
          ELSE 'free_launch_tool' 
        END,
        updated_at = now()
    WHERE order_id = p_order_id OR order_number = v_order.order_number;

    -- Demote live tool listing if tool record is resolved
    IF v_target_tool_id IS NOT NULL THEN
      UPDATE public.ai_tools
      SET is_paid = false,
          submission_tier = CASE 
            WHEN v_order.plan_id LIKE '%update%' THEN 'free_update_tool' 
            ELSE 'free_launch_tool' 
          END,
          updated_at = now()
      WHERE tool_id = v_target_tool_id;

      -- Deactivate complimentary 1-day bonus sidebar ad ONLY if launch plan
      -- (Per site_settings page_setting_paid_plans, update plans have no sidebar ad attached)
      IF v_order.plan_id LIKE '%launch_tool%' THEN
        UPDATE public.advertisement_tools
        SET status = 'inactive',
            updated_at = now()
        WHERE tool_id = v_target_tool_id
          AND order_id IS NULL
          AND featured_type @> ARRAY['sidebar']::text[]
          AND status IN ('active', 'inactive');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'status', 'refunded',
    'target_tool_id', v_target_tool_id
  );
END;
$$;

-- 5. Add B-tree index on blog_posts(updated_at DESC) for fast sorting and sparklines
CREATE INDEX IF NOT EXISTS idx_blog_posts_updated_at 
ON public.blog_posts (updated_at DESC);

