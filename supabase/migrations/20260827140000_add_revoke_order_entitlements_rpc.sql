-- Migration: 20260827140000_add_revoke_order_entitlements_rpc.sql
-- Description: Atomically transitions an order to 'refunded' and records refund transaction details
--              without modifying, demoting, or revoking any tool, advertisement, or blog entitlements.

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

  -- 2. Update Order to 'refunded' and record refund audit metadata (entitlements remain untouched)
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

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'status', 'refunded'
  );
END;
$$;

-- 3. Add B-tree index on blog_posts(updated_at DESC) for fast sorting and sparklines
CREATE INDEX IF NOT EXISTS idx_blog_posts_updated_at 
ON public.blog_posts (updated_at DESC);
