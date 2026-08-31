-- Migration: Standardize RLS Policies & Enforce Server-Side Service Role Key for Admin Operations
-- Description: Preserves clean, fast public/user RLS policies on public tables without intrusive is_admin() subqueries.
-- Administrative reads and mutations are handled securely server-side in Next.js Server Actions / API Routes
-- using supabaseAdmin (Service Role Key) and SECURITY DEFINER RPCs after verifying granular subadmin RBAC permissions.

-- ============================================================================
-- 1. STANDARD USER & PUBLIC POLICIES (Clean, indexed, fast)
-- ============================================================================

-- 1.1 Admin Roles: Authenticated users can only read their own role assignment on login
DROP POLICY IF EXISTS "Users can view their own roles" ON public.admin_roles;
CREATE POLICY "Users can view their own roles" 
ON public.admin_roles 
FOR SELECT 
TO authenticated 
USING ((( SELECT auth.uid() AS uid) = user_id));

-- 1.2 Socials: Public visitors and users can only view 'Show' (published) posts directly
DROP POLICY IF EXISTS "Allow public read access to socials" ON public.socials;
CREATE POLICY "Allow public read access to socials" 
ON public.socials 
FOR SELECT 
TO anon, authenticated 
USING (status = 'Show'::text);

-- 1.3 User Profiles: Authenticated users retain direct access only to their own profile
DROP POLICY IF EXISTS "user_profiles_owner_policy" ON public.user_profiles;
CREATE POLICY "user_profiles_owner_policy" 
ON public.user_profiles 
FOR ALL 
TO authenticated 
USING ((( SELECT auth.uid() AS uid) = id))
WITH CHECK ((( SELECT auth.uid() AS uid) = id));


-- ============================================================================
-- 2. SERVER-SIDE HANDLED POLICIES (Bypassed via Service Role Key + RBAC)
-- ============================================================================
-- All administrative management (Drafts/Hide moderation, Submissions approval,
-- Orders & Refunds, Reports, Models, Team Management) is executed securely server-side
-- via supabaseAdmin (Service Role Key) or SECURITY DEFINER RPC functions with verifyAdminPermission().
-- Direct client-side write policies are dropped to enforce strict server-side validation and financial data protection.

-- 2.1 Tool Reports: Handled via deleteToolReportAction / updateToolReportAction
DROP POLICY IF EXISTS "admin_update_tool_reports" ON public.tool_reports;

-- 2.2 AI Tool Submissions: Handled via deleteToolSubmissionAction / updateToolSubmissionAction
DROP POLICY IF EXISTS "admin_delete_ai_tool_submissions" ON public.ai_tool_submissions;

-- 2.3 Orders: Handled via getOrdersAction, updateOrderAction, deleteOrderAction, and refund API
DROP POLICY IF EXISTS "admin_manage_orders" ON public.orders;

-- 2.4 AI Models: Handled via getModelsAction, createModelAction, updateModelAction, deleteModelAction
DROP POLICY IF EXISTS "admin_manage_models" ON public.models;
