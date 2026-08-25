-- Migration: 20260817132500_add_subadmin_rbac_and_permissions.sql
-- Description: Manage Sub-Admin RBAC & granular permissions directly in existing public.admin_roles table (NO new table needed).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Update admin_roles check constraint to include 'subadmin'
ALTER TABLE public.admin_roles DROP CONSTRAINT IF EXISTS user_roles_role_name_check;
ALTER TABLE public.admin_roles DROP CONSTRAINT IF EXISTS admin_roles_role_name_check;
ALTER TABLE public.admin_roles ADD CONSTRAINT admin_roles_role_name_check 
  CHECK (role_name::text = ANY (ARRAY['admin'::text, 'subadmin'::text, 'moderator'::text, 'user'::text]));

-- 2. Add 'permissions' JSONB column to the existing public.admin_roles table
ALTER TABLE public.admin_roles 
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- 3. RPC: get_admin_team_members (Super Admin only: lists all admins & subadmins directly from auth.users + admin_roles)
CREATE OR REPLACE FUNCTION public.get_admin_team_members()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: Only Super Admins can access team management.';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'role', r.role_name,
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'full_name', COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
      'avatar_url', COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', NULL),
      'granted_by', r.granted_by,
      'granted_at', r.granted_at,
      'permissions', COALESCE(r.permissions, '{}'::jsonb)
    ) ORDER BY (r.role_name = 'admin') DESC, u.created_at ASC
  ) INTO result
  FROM auth.users u
  JOIN public.admin_roles r ON u.id = r.user_id
  WHERE r.role_name IN ('admin', 'subadmin');

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- 4. RPC: save_subadmin_permissions (Super Admin only: updates permissions inside admin_roles)
CREATE OR REPLACE FUNCTION public.save_subadmin_permissions(
  p_target_user_id uuid,
  p_permissions jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: Only Super Admins can update permissions.';
  END IF;

  IF public.is_admin(p_target_user_id) AND auth.uid() <> p_target_user_id THEN
    RAISE EXCEPTION 'Super Admin permissions cannot be modified.';
  END IF;

  UPDATE public.admin_roles
  SET 
    permissions = p_permissions,
    updated_at = NOW()
  WHERE user_id = p_target_user_id;

  RETURN true;
END;
$$;

-- 5. RPC: create_subadmin_user (Super Admin only: creates user in auth.users and assigns role + permissions in admin_roles)
CREATE OR REPLACE FUNCTION public.create_subadmin_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_permissions jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  new_user_id uuid;
  clean_email text := lower(trim(p_email));
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: Only Super Admins can create sub-admins.';
  END IF;

  SELECT id INTO new_user_id FROM auth.users WHERE email = clean_email;
  
  IF new_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = new_user_id) THEN
      RAISE EXCEPTION 'A user with this email already exists with an assigned role.';
    END IF;
  ELSE
    new_user_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      clean_email,
      crypt(p_password, gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object('full_name', p_full_name, 'email', clean_email),
      now(),
      now(),
      encode(gen_random_bytes(32), 'hex')
    );

    INSERT INTO public.user_profiles (id)
    VALUES (new_user_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.admin_roles (user_id, role_name, permissions, granted_by, granted_at)
  VALUES (new_user_id, 'subadmin', COALESCE(p_permissions, '{}'::jsonb), auth.uid(), now())
  ON CONFLICT (user_id, role_name) DO UPDATE SET
    permissions = EXCLUDED.permissions,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id);
END;
$$;

-- 6. RPC: delete_subadmin_user (Super Admin only: removes sub-admin)
CREATE OR REPLACE FUNCTION public.delete_subadmin_user(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: Only Super Admins can remove sub-admins.';
  END IF;

  IF p_target_user_id = auth.uid() OR public.is_admin(p_target_user_id) THEN
    RAISE EXCEPTION 'Super Admins cannot be removed.';
  END IF;

  DELETE FROM public.admin_roles WHERE user_id = p_target_user_id;
  DELETE FROM auth.users WHERE id = p_target_user_id;

  RETURN true;
END;
$$;
