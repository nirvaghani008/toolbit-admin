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
-- 2. SERVER-SIDE HANDLED POLICIES (Bypassed via Service Role Key + RBAC)
-- ============================================================================
-- The following administrative write/delete operations are handled securely
-- server-side in Next.js Server Actions / API Routes using supabaseAdmin (Service Role Key)
-- after cryptographically validating the user JWT and checking granular permissions via verifyAdminPermission().
-- Direct client-side write RLS policies are dropped to enforce strict server-side validation and financial data protection.

-- 2.1 Tool Reports: Handled via deleteToolReportAction / updateToolReportAction
DROP POLICY IF EXISTS "admin_update_tool_reports" ON public.tool_reports;

-- 2.2 AI Tool Submissions: Handled via deleteToolSubmissionAction / updateToolSubmissionAction
DROP POLICY IF EXISTS "admin_delete_ai_tool_submissions" ON public.ai_tool_submissions;

-- 2.3 Orders: Handled via getOrdersAction, updateOrderAction, deleteOrderAction, and refund API
DROP POLICY IF EXISTS "admin_manage_orders" ON public.orders;

-- 2.4 AI Models: Handled via getModelsAction, createModelAction, updateModelAction, deleteModelAction
DROP POLICY IF EXISTS "admin_manage_models" ON public.models;



