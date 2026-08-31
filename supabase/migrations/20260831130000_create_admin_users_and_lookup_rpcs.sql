-- Migration: 20260831130000_create_admin_users_and_lookup_rpcs.sql
-- Description: Create optimized, production-ready get_admin_users and get_users_by_ids RPC functions
-- with strict RBAC authorization (Super Admin & Subadmins), service_role support, collection parsing, and index optimizations.

-- 1. Drop existing function signatures to allow altering return table type
DROP FUNCTION IF EXISTS public.get_admin_users(text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_admin_users();

-- 2. Create or replace get_admin_users RPC function
CREATE OR REPLACE FUNCTION public.get_admin_users(
  p_search text DEFAULT NULL::text,
  p_sort text DEFAULT 'desc'::text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone,
  last_sign_in_at timestamp with time zone,
  saved_count integer,
  upvoted_count integer,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_is_asc boolean;
BEGIN
  -- 1. Strict admin / subadmin / service_role authorization check
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
    RAISE EXCEPTION 'Unauthorized: Only administrators can access admin user management.';
  END IF;

  -- 2. Determine sort direction (supports 'asc', 'desc', 'created_at-asc', 'created_at-desc')
  v_is_asc := (p_sort ILIKE '%asc%');

  -- 3. Execute query with explicit branch for index optimization on auth.users(created_at)
  IF v_is_asc THEN
    RETURN QUERY
    SELECT
      au.id,
      au.email::TEXT AS email,
      COALESCE(
        (au.raw_user_meta_data->>'full_name')::TEXT,
        (au.raw_user_meta_data->>'name')::TEXT,
        split_part(au.email, '@', 1)::TEXT
      ) AS full_name,
      COALESCE(
        (au.raw_user_meta_data->>'avatar_url')::TEXT,
        (au.raw_user_meta_data->>'picture')::TEXT,
        NULL
      ) AS avatar_url,
      au.created_at,
      au.last_sign_in_at,
      COALESCE(
        (
          SELECT count(DISTINCT t_id)::int
          FROM (
            SELECT jsonb_array_elements_text(
              CASE 
                WHEN jsonb_typeof(up.saved_tools->'default') = 'array' THEN up.saved_tools->'default'
                WHEN jsonb_typeof(up.saved_tools) = 'array' THEN up.saved_tools
                ELSE '[]'::jsonb
              END
            ) AS t_id
            UNION ALL
            SELECT elems.tool_id
            FROM jsonb_array_elements(
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
          ) s
          WHERE t_id ~ '^[0-9]+$'
        ), 0
      )::INT AS saved_count,
      COALESCE(
        CASE
          WHEN jsonb_typeof(up.upvoted_tools) = 'array'
          THEN jsonb_array_length(up.upvoted_tools)
          ELSE 0
        END, 0
      )::INT AS upvoted_count,
      COUNT(*) OVER()::BIGINT AS total_count
    FROM auth.users au
    LEFT JOIN public.user_profiles up ON up.id = au.id
    WHERE (
      p_search IS NULL
      OR p_search = ''
      OR au.email ILIKE '%' || p_search || '%'
      OR (au.raw_user_meta_data->>'full_name') ILIKE '%' || p_search || '%'
      OR (au.raw_user_meta_data->>'name') ILIKE '%' || p_search || '%'
    )
    ORDER BY au.created_at ASC
    LIMIT p_limit
    OFFSET p_offset;
  ELSE
    RETURN QUERY
    SELECT
      au.id,
      au.email::TEXT AS email,
      COALESCE(
        (au.raw_user_meta_data->>'full_name')::TEXT,
        (au.raw_user_meta_data->>'name')::TEXT,
        split_part(au.email, '@', 1)::TEXT
      ) AS full_name,
      COALESCE(
        (au.raw_user_meta_data->>'avatar_url')::TEXT,
        (au.raw_user_meta_data->>'picture')::TEXT,
        NULL
      ) AS avatar_url,
      au.created_at,
      au.last_sign_in_at,
      COALESCE(
        (
          SELECT count(DISTINCT t_id)::int
          FROM (
            SELECT jsonb_array_elements_text(
              CASE 
                WHEN jsonb_typeof(up.saved_tools->'default') = 'array' THEN up.saved_tools->'default'
                WHEN jsonb_typeof(up.saved_tools) = 'array' THEN up.saved_tools
                ELSE '[]'::jsonb
              END
            ) AS t_id
            UNION ALL
            SELECT elems.tool_id
            FROM jsonb_array_elements(
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
          ) s
          WHERE t_id ~ '^[0-9]+$'
        ), 0
      )::INT AS saved_count,
      COALESCE(
        CASE
          WHEN jsonb_typeof(up.upvoted_tools) = 'array'
          THEN jsonb_array_length(up.upvoted_tools)
          ELSE 0
        END, 0
      )::INT AS upvoted_count,
      COUNT(*) OVER()::BIGINT AS total_count
    FROM auth.users au
    LEFT JOIN public.user_profiles up ON up.id = au.id
    WHERE (
      p_search IS NULL
      OR p_search = ''
      OR au.email ILIKE '%' || p_search || '%'
      OR (au.raw_user_meta_data->>'full_name') ILIKE '%' || p_search || '%'
      OR (au.raw_user_meta_data->>'name') ILIKE '%' || p_search || '%'
    )
    ORDER BY au.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  END IF;
END;
$$;

-- 3. Drop existing get_users_by_ids signatures to allow altering return table type
DROP FUNCTION IF EXISTS public.get_users_by_ids(text[]);
DROP FUNCTION IF EXISTS public.get_users_by_ids(uuid[]);
DROP FUNCTION IF EXISTS public.get_users_by_ids();

-- 4. Create or replace get_users_by_ids RPC function
-- Allows service_role, Super Admins, and Subadmins to look up user display profiles for orders, reports, and activity logs.
CREATE OR REPLACE FUNCTION public.get_users_by_ids(p_ids text[])
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  avatar_url text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uuids uuid[];
BEGIN
  -- 1. Fast exit if input is null or empty
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL OR array_length(p_ids, 1) = 0 THEN
    RETURN;
  END IF;

  -- 2. Strict authorization: service_role or admin / subadmin
  IF COALESCE(auth.role(), '') <> 'service_role' AND (
    auth.uid() IS NULL OR NOT (
      public.is_admin(auth.uid()) OR EXISTS (
        SELECT 1 FROM public.admin_roles ar
        WHERE ar.user_id = auth.uid()
          AND ar.role_name IN ('admin', 'subadmin')
      )
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can query user profiles by IDs.';
  END IF;

  -- 3. Extract and cast only valid UUIDs to prevent invalid syntax casting errors and enable B-Tree index scan on users_pkey
  SELECT ARRAY(
    SELECT DISTINCT raw_id::uuid
    FROM unnest(p_ids) AS raw_id
    WHERE raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) INTO v_uuids;

  IF v_uuids IS NULL OR array_length(v_uuids, 1) IS NULL OR array_length(v_uuids, 1) = 0 THEN
    RETURN;
  END IF;

  -- 4. Query using index scan on auth.users(id)
  RETURN QUERY
  SELECT
    au.id,
    au.email::TEXT,
    COALESCE(
      (au.raw_user_meta_data->>'full_name')::TEXT,
      (au.raw_user_meta_data->>'name')::TEXT,
      split_part(au.email, '@', 1)::TEXT
    ) AS full_name,
    COALESCE(
      (au.raw_user_meta_data->>'avatar_url')::TEXT,
      (au.raw_user_meta_data->>'picture')::TEXT,
      NULL
    ) AS avatar_url
  FROM auth.users au
  WHERE au.id = ANY(v_uuids);
END;
$$;

-- 3. Explicit permissions configuration
REVOKE EXECUTE ON FUNCTION public.get_admin_users(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_users(text, text, integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_users_by_ids(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_users_by_ids(text[]) TO authenticated, service_role;
