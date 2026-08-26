-- Migration: 20260826020000_update_admin_permissions_system.sql
-- Description: Expand admin permissions system to support granular, page-by-page access controls (including separate permissions for Users, Newsletter, Categories, Hashtags, Reviews, Reports, Submissions, Advertise, etc.) and allow Super Admins to configure permissions for both Admins and Sub-Admins.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Ensure public.admin_roles table has the permissions JSONB column
ALTER TABLE public.admin_roles 
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- 2. Update RPC: save_subadmin_permissions
-- Allows Super Admins to update permissions for any administrator (admin or subadmin)
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
  -- Strict Super Admin authorization check
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: Only Super Admins can update permissions.';
  END IF;

  -- Update permissions on the target user's role record
  UPDATE public.admin_roles
  SET 
    permissions = COALESCE(p_permissions, '{}'::jsonb),
    updated_at = NOW()
  WHERE user_id = p_target_user_id;

  RETURN true;
END;
$$;

-- 3. Update RPC: get_admin_team_members
-- Returns all administrators with their full profile and granular permissions dictionary
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

-- 4. Update RPC: create_subadmin_user
-- Allows Super Admins to provision admin or sub-admin accounts with preconfigured granular permissions
CREATE OR REPLACE FUNCTION public.create_subadmin_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_permissions jsonb DEFAULT '{}'::jsonb,
  p_role text DEFAULT 'subadmin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  new_user_id uuid;
  clean_email text := lower(trim(p_email));
  target_role text := COALESCE(p_role, 'subadmin');
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: Only Super Admins can create team accounts.';
  END IF;

  IF target_role NOT IN ('admin', 'subadmin') THEN
    RAISE EXCEPTION 'Invalid role specified. Must be admin or subadmin.';
  END IF;

  SELECT id INTO new_user_id FROM auth.users WHERE email = clean_email;
  
  IF new_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = new_user_id) THEN
      RAISE EXCEPTION 'A user with this email already exists with an assigned role.';
    END IF;
  ELSE
    new_user_id := gen_random_uuid();
    
    -- Insert into auth.users with all required GoTrue string defaults
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_token,
      email_change,
      email_change_token_new,
      email_change_token_current,
      phone_change,
      phone_change_token,
      reauthentication_token,
      email_change_confirm_status,
      raw_app_meta_data,
      raw_user_meta_data,
      is_sso_user,
      is_anonymous,
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
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      0,
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object('full_name', p_full_name, 'email', clean_email),
      false,
      false,
      now(),
      now(),
      encode(gen_random_bytes(32), 'hex')
    );

    -- Insert into auth.identities for GoTrue password authentication
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      new_user_id,
      jsonb_build_object('sub', new_user_id::text, 'email', clean_email, 'full_name', p_full_name),
      'email',
      new_user_id::text,
      now(),
      now(),
      now()
    );

    INSERT INTO public.user_profiles (id)
    VALUES (new_user_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.admin_roles (user_id, role_name, permissions, granted_by, granted_at)
  VALUES (new_user_id, target_role, COALESCE(p_permissions, '{}'::jsonb), auth.uid(), now())
  ON CONFLICT (user_id, role_name) DO UPDATE SET
    role_name = EXCLUDED.role_name,
    permissions = EXCLUDED.permissions,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id);
END;
$$;

-- 5. Data Repair: Fix any existing admin/subadmin accounts with NULL GoTrue string fields and missing identities
UPDATE auth.users u
SET 
  email_change = COALESCE(u.email_change, ''),
  email_change_token_new = COALESCE(u.email_change_token_new, ''),
  email_change_token_current = COALESCE(u.email_change_token_current, ''),
  recovery_token = COALESCE(u.recovery_token, ''),
  phone_change = COALESCE(u.phone_change, ''),
  phone_change_token = COALESCE(u.phone_change_token, ''),
  reauthentication_token = COALESCE(u.reauthentication_token, ''),
  email_confirmed_at = COALESCE(u.email_confirmed_at, now())
FROM public.admin_roles r
WHERE u.id = r.user_id;

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  u.id,
  jsonb_build_object(
    'sub', u.id::text, 
    'email', u.email, 
    'full_name', COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))
  ),
  'email',
  u.id::text,
  now(),
  now(),
  now()
FROM auth.users u
JOIN public.admin_roles r ON u.id = r.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
);
