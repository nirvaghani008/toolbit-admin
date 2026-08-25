-- Migration: Add Admin-Only RLS Policies
-- Description: Updates existing user policies in-place where possible (adding OR is_admin()) and adds missing write policies for admin moderation without breaking any user policies created by senior devs.

-- ============================================================================
-- 1. IN-PLACE POLICY UPDATES (Modifying existing policies to include admin access)
-- ============================================================================

-- 1.1 Admin Roles: Allow admins to view all team members while regular users still view only their own role
DROP POLICY IF EXISTS "Users can view their own roles" ON public.admin_roles;
CREATE POLICY "Users can view their own roles" 
ON public.admin_roles 
FOR SELECT 
TO authenticated 
USING ((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT is_admin() AS is_admin));

-- 1.2 Socials: Allow admins to view all states (Draft, Hide, Show) while public continues to view only 'Show'
DROP POLICY IF EXISTS "Allow public read access to socials" ON public.socials;
CREATE POLICY "Allow public read access to socials" 
ON public.socials 
FOR SELECT 
TO anon, authenticated 
USING ((status = 'Show'::text) OR ( SELECT is_admin() AS is_admin));

-- 1.3 User Profiles: Allow admins to view all user profiles in the portal while users retain full own-profile access
DROP POLICY IF EXISTS "user_profiles_owner_policy" ON public.user_profiles;
CREATE POLICY "user_profiles_owner_policy" 
ON public.user_profiles 
FOR ALL 
TO authenticated 
USING ((( SELECT auth.uid() AS uid) = id) OR ( SELECT is_admin() AS is_admin))
WITH CHECK ((( SELECT auth.uid() AS uid) = id) OR ( SELECT is_admin() AS is_admin));


-- ============================================================================
-- 2. MISSING ACTION POLICIES (Adding admin policies only where no policy exists)
-- ============================================================================

-- 2.1 Tool Reports: Add missing UPDATE policy for admins to resolve reports (SELECT, INSERT, DELETE user policies untouched)
DROP POLICY IF EXISTS "admin_update_tool_reports" ON public.tool_reports;
CREATE POLICY "admin_update_tool_reports" 
ON public.tool_reports 
FOR UPDATE 
TO authenticated 
USING (( SELECT is_admin() AS is_admin)) 
WITH CHECK (( SELECT is_admin() AS is_admin));

-- 2.2 AI Tool Submissions: Add missing DELETE policy for admins to remove submissions (SELECT, INSERT, UPDATE user policies untouched)
DROP POLICY IF EXISTS "admin_delete_ai_tool_submissions" ON public.ai_tool_submissions;
CREATE POLICY "admin_delete_ai_tool_submissions" 
ON public.ai_tool_submissions 
FOR DELETE 
TO authenticated 
USING (( SELECT is_admin() AS is_admin));

-- 2.3 Orders: Add admin management access (User SELECT policy orders_select_user_policy untouched)
DROP POLICY IF EXISTS "admin_manage_orders" ON public.orders;
CREATE POLICY "admin_manage_orders" 
ON public.orders 
FOR ALL 
TO authenticated 
USING (( SELECT is_admin() AS is_admin)) 
WITH CHECK (( SELECT is_admin() AS is_admin));


-- ============================================================================
-- 3. OPTIONAL / FUTURE POLICIES (COMMENTED OUT)
-- ============================================================================

-- 3.1 AI Models: Currently public read-only. Uncomment when write permissions for admins are needed.
-- DROP POLICY IF EXISTS "admin_manage_models" ON public.models;
-- CREATE POLICY "admin_manage_models" 
-- ON public.models 
-- FOR ALL 
-- TO authenticated 
-- USING (( SELECT is_admin() AS is_admin)) 
-- WITH CHECK (( SELECT is_admin() AS is_admin));


