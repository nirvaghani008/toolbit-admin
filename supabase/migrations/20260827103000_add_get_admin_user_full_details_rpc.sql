-- Migration: 20260827103000_add_get_admin_user_full_details_rpc.sql
-- Description: Create an optimized, single-query RPC function to fetch complete user details,
-- including profile auth metadata, saved tools (with ai_tools info), upvoted tools (with ai_tools info),
-- new tool launches/submissions, update requests, advertisements, guest posts, orders/billing, reviews, and reports.

CREATE OR REPLACE FUNCTION public.get_admin_user_full_details(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_result jsonb;
  v_profile jsonb;
  v_saved_tools jsonb := '[]'::jsonb;
  v_upvoted_tools jsonb := '[]'::jsonb;
  v_submissions jsonb := '[]'::jsonb;
  v_updates jsonb := '[]'::jsonb;
  v_advertisements jsonb := '[]'::jsonb;
  v_blog_posts jsonb := '[]'::jsonb;
  v_orders jsonb := '[]'::jsonb;
  v_reviews jsonb := '[]'::jsonb;
  v_tool_reports jsonb := '[]'::jsonb;
  v_total_spend numeric := 0;
BEGIN
  -- 1. Strict admin / subadmin authorization check
  IF COALESCE(auth.role(), '') <> 'service_role' AND (
    auth.uid() IS NULL OR NOT (
      public.is_admin(auth.uid()) OR EXISTS (
        SELECT 1 FROM public.admin_roles ar
        WHERE ar.user_id = auth.uid()
          AND (
            ar.role_name = 'admin'
            OR (
              ar.role_name = 'subadmin'
              AND (
                COALESCE((ar.permissions->'users'->>'can_view')::boolean, false) = true
                OR ar.permissions = '{}'::jsonb
              )
            )
          )
      )
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can access complete user details.';
  END IF;

  -- 2. Fetch User Profile & Auth metadata
  SELECT jsonb_build_object(
    'id', au.id,
    'email', au.email,
    'full_name', COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)),
    'avatar_url', COALESCE(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture', NULL),
    'created_at', au.created_at,
    'last_sign_in_at', au.last_sign_in_at,
    'email_confirmed_at', au.email_confirmed_at,
    'role', COALESCE(ar.role_name, 'user'),
    'permissions', COALESCE(ar.permissions, '{}'::jsonb)
  )
  INTO v_profile
  FROM auth.users au
  LEFT JOIN public.admin_roles ar ON ar.user_id = au.id
  WHERE au.id = p_user_id;

  -- If user does not exist in auth.users, return null
  IF v_profile IS NULL THEN
    RETURN NULL;
  END IF;

  -- 3. Fetch Saved Tools with full ai_tools info
  WITH user_prof AS (
    SELECT saved_tools FROM public.user_profiles WHERE id = p_user_id
  ),
  default_saved AS (
    SELECT 
      elems.val::int AS tool_id,
      'Default'::text AS collection_name
    FROM user_prof up,
    LATERAL jsonb_array_elements_text(
      CASE 
        WHEN jsonb_typeof(up.saved_tools->'default') = 'array' THEN up.saved_tools->'default'
        WHEN jsonb_typeof(up.saved_tools) = 'array' THEN up.saved_tools
        ELSE '[]'::jsonb
      END
    ) elems(val)
    WHERE elems.val ~ '^[0-9]+$'
  ),
  collections_saved AS (
    SELECT 
      elems.tool_id::int AS tool_id,
      COALESCE(c.col->>'name', 'Collection') AS collection_name
    FROM user_prof up,
    LATERAL jsonb_array_elements(
      CASE 
        WHEN jsonb_typeof(up.saved_tools->'collections') = 'array' THEN up.saved_tools->'collections'
        ELSE '[]'::jsonb
      END
    ) c(col),
    LATERAL jsonb_array_elements_text(
      CASE 
        WHEN jsonb_typeof(c.col->'tool_ids') = 'array' THEN c.col->'tool_ids'
        ELSE '[]'::jsonb
      END
    ) elems(tool_id)
    WHERE elems.tool_id ~ '^[0-9]+$'
  ),
  all_saved AS (
    SELECT tool_id, array_agg(DISTINCT collection_name) AS collections
    FROM (
      SELECT * FROM default_saved
      UNION ALL
      SELECT * FROM collections_saved
    ) combined
    GROUP BY tool_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'tool_id', t.tool_id,
      'tool_name', COALESCE(t.tool_info->>'toolName', t.tool_url, 'Tool #' || t.tool_id::text),
      'tool_url', t.tool_url,
      'tool_site_url', t.tool_site_url,
      'favicon_url', t.favicon_url,
      'tagline', t.tool_info->>'tagline',
      'status', t.status,
      'pricing_model', t.tool_info->>'pricingModel',
      'collections', s.collections
    ) ORDER BY t.tool_id DESC
  ), '[]'::jsonb)
  INTO v_saved_tools
  FROM all_saved s
  JOIN public.ai_tools t ON t.tool_id = s.tool_id;

  -- 4. Fetch Upvoted Tools with full ai_tools info
  WITH user_prof AS (
    SELECT upvoted_tools FROM public.user_profiles WHERE id = p_user_id
  ),
  all_upvoted AS (
    SELECT DISTINCT elems.val::int AS tool_id
    FROM user_prof up,
    LATERAL jsonb_array_elements_text(
      CASE 
        WHEN jsonb_typeof(up.upvoted_tools) = 'array' THEN up.upvoted_tools
        ELSE '[]'::jsonb
      END
    ) elems(val)
    WHERE elems.val ~ '^[0-9]+$'
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'tool_id', t.tool_id,
      'tool_name', COALESCE(t.tool_info->>'toolName', t.tool_url, 'Tool #' || t.tool_id::text),
      'tool_url', t.tool_url,
      'tool_site_url', t.tool_site_url,
      'favicon_url', t.favicon_url,
      'tagline', t.tool_info->>'tagline',
      'status', t.status,
      'pricing_model', t.tool_info->>'pricingModel'
    ) ORDER BY t.tool_id DESC
  ), '[]'::jsonb)
  INTO v_upvoted_tools
  FROM all_upvoted u
  JOIN public.ai_tools t ON t.tool_id = u.tool_id;

  -- 5. Fetch Tool Launches / Submissions (mode = 'submit')
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'tool_id', s.tool_id,
      'tool_name', COALESCE(s.tool_info->>'toolName', t.tool_info->>'toolName', s.tool_domain, 'Submission #' || s.id::text),
      'tool_url', COALESCE(t.tool_url, s.tool_domain, s.tool_url),
      'tool_site_url', COALESCE(s.tool_site_url, s.tool_url, t.tool_site_url),
      'status', s.status,
      'submission_tier', s.submission_tier,
      'is_paid', s.is_paid,
      'created_at', s.created_at,
      'updated_at', s.updated_at,
      'ai_approved', s.ai_approved,
      'ai_denied_reason', s.ai_denied_reason,
      'favicon_url', COALESCE(s.favicon_url, t.favicon_url),
      'tool_screenshot_url', COALESCE(s.tool_screenshot_url, t.tool_screenshot_url),
      'order_id', s.order_id
    ) ORDER BY s.created_at DESC
  ), '[]'::jsonb)
  INTO v_submissions
  FROM public.ai_tool_submissions s
  LEFT JOIN public.ai_tools t ON t.tool_id = s.tool_id
  WHERE s.user_id = p_user_id AND (s.mode = 'submit' OR s.mode IS NULL);

  -- 6. Fetch Tool Updates (mode = 'update')
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'tool_id', s.tool_id,
      'tool_name', COALESCE(s.tool_info->>'toolName', t.tool_info->>'toolName', s.tool_domain, 'Update #' || s.id::text),
      'tool_url', t.tool_url,
      'tool_site_url', COALESCE(s.tool_site_url, s.tool_url, t.tool_site_url),
      'status', s.status,
      'submission_tier', s.submission_tier,
      'is_paid', s.is_paid,
      'created_at', s.created_at,
      'updated_at', s.updated_at,
      'ai_approved', s.ai_approved,
      'ai_denied_reason', s.ai_denied_reason,
      'favicon_url', COALESCE(s.favicon_url, t.favicon_url),
      'tool_screenshot_url', COALESCE(s.tool_screenshot_url, t.tool_screenshot_url),
      'order_id', s.order_id
    ) ORDER BY s.created_at DESC
  ), '[]'::jsonb)
  INTO v_updates
  FROM public.ai_tool_submissions s
  LEFT JOIN public.ai_tools t ON t.tool_id = s.tool_id
  WHERE s.user_id = p_user_id AND s.mode = 'update';

  -- 7. Fetch Advertisements
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'tool_id', a.tool_id,
      'tool_name', COALESCE(t.tool_info->>'toolName', t.tool_url, 'Tool #' || a.tool_id::text),
      'tool_url', t.tool_url,
      'favicon_url', t.favicon_url,
      'tool_site_url', COALESCE(a.tool_site_url, t.tool_site_url),
      'featured_type', a.featured_type,
      'display_order', a.display_order,
      'status', a.status,
      'start_date', a.start_date,
      'end_date', a.end_date,
      'click_count', a.click_count,
      'impression_count', a.impression_count,
      'social_share_url', a.social_share_url,
      'social_platform', a.social_platform,
      'order_id', a.order_id,
      'created_at', a.created_at
    ) ORDER BY a.created_at DESC
  ), '[]'::jsonb)
  INTO v_advertisements
  FROM public.advertisement_tools a
  LEFT JOIN public.ai_tools t ON t.tool_id = a.tool_id
  WHERE a.user_id = p_user_id;

  -- 8. Fetch Guest Posts / Blog posts
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', b.id,
      'title', b.title,
      'slug', b.slug,
      'description', b.description,
      'featured_image_url', b.featured_image_url,
      'status', b.status,
      'submission_tier', b.submission_tier,
      'view_count', b.view_count,
      'reading_time_minutes', b.reading_time_minutes,
      'is_featured', b.is_featured,
      'is_paid', b.is_paid,
      'created_at', b.created_at,
      'updated_at', b.updated_at
    ) ORDER BY b.created_at DESC
  ), '[]'::jsonb)
  INTO v_blog_posts
  FROM public.blog_posts b
  WHERE b.author_id = p_user_id;

  -- 9. Fetch Orders & Billing
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'plan_id', o.plan_id,
      'amount_usd', o.amount_usd,
      'status', o.status,
      'payment_method', o.payment_method,
      'currency', o.currency,
      'invoice_url', o.invoice_url,
      'receipt_url', o.receipt_url,
      'created_at', o.created_at
    ) ORDER BY o.created_at DESC
  ), '[]'::jsonb)
  INTO v_orders
  FROM public.orders o
  WHERE o.user_id = p_user_id;

  -- Calculate total completed spend
  SELECT COALESCE(SUM(o.amount_usd), 0)
  INTO v_total_spend
  FROM public.orders o
  WHERE o.user_id = p_user_id AND o.status = 'completed';

  -- 10. Fetch Reviews
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'review_id', r.review_id,
      'tool_id', r.tool_id,
      'tool_name', COALESCE(t.tool_info->>'toolName', t.tool_url, 'Tool #' || r.tool_id::text),
      'tool_url', t.tool_url,
      'tool_site_url', t.tool_site_url,
      'favicon_url', t.favicon_url,
      'rating', r.rating,
      'review_text', r.review_text,
      'status', r.status,
      'helpful_count', r.helpful_count,
      'review_date', r.review_date
    ) ORDER BY r.review_date DESC
  ), '[]'::jsonb)
  INTO v_reviews
  FROM public.reviews r
  LEFT JOIN public.ai_tools t ON t.tool_id = r.tool_id
  WHERE r.user_id = p_user_id;

  -- 11. Fetch Tool Bug / Issue Reports
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', tr.id,
      'tool_id', tr.tool_id,
      'tool_name', COALESCE(t.tool_info->>'toolName', t.tool_url, 'Tool #' || tr.tool_id::text),
      'tool_url', t.tool_url,
      'tool_site_url', t.tool_site_url,
      'favicon_url', t.favicon_url,
      'report_type', tr.report_type,
      'description', tr.description,
      'created_at', tr.created_at
    ) ORDER BY tr.created_at DESC
  ), '[]'::jsonb)
  INTO v_tool_reports
  FROM public.tool_reports tr
  LEFT JOIN public.ai_tools t ON t.tool_id = tr.tool_id
  WHERE tr.user_id = p_user_id;

  -- 12. Build Final Consolidated JSON
  v_result := jsonb_build_object(
    'profile', v_profile,
    'summary', jsonb_build_object(
      'saved_count', jsonb_array_length(v_saved_tools),
      'upvoted_count', jsonb_array_length(v_upvoted_tools),
      'submissions_count', jsonb_array_length(v_submissions),
      'updates_count', jsonb_array_length(v_updates),
      'advertisements_count', jsonb_array_length(v_advertisements),
      'blog_posts_count', jsonb_array_length(v_blog_posts),
      'orders_count', jsonb_array_length(v_orders),
      'total_spend_usd', v_total_spend,
      'reviews_count', jsonb_array_length(v_reviews),
      'tool_reports_count', jsonb_array_length(v_tool_reports)
    ),
    'saved_tools', v_saved_tools,
    'upvoted_tools', v_upvoted_tools,
    'submissions', v_submissions,
    'updates', v_updates,
    'advertisements', v_advertisements,
    'blog_posts', v_blog_posts,
    'orders', v_orders,
    'reviews', v_reviews,
    'tool_reports', v_tool_reports
  );

  RETURN v_result;
END;
$$;
