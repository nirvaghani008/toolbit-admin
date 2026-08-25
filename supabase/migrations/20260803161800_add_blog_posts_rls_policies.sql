-- Migration: 20260803161800_add_blog_posts_rls_policies.sql
-- Description: Add missing INSERT, UPDATE, and DELETE RLS policies for blog_posts table to allow admins and authors to perform CRUD operations.

DROP POLICY IF EXISTS "blog_posts_admin_insert" ON public.blog_posts;
CREATE POLICY "blog_posts_admin_insert" 
ON public.blog_posts 
FOR INSERT 
TO authenticated 
WITH CHECK ( (SELECT is_admin()) OR (auth.uid() IS NOT NULL) );

DROP POLICY IF EXISTS "blog_posts_admin_update" ON public.blog_posts;
CREATE POLICY "blog_posts_admin_update" 
ON public.blog_posts 
FOR UPDATE 
TO authenticated 
USING ( (SELECT is_admin()) OR (author_id = auth.uid()) )
WITH CHECK ( (SELECT is_admin()) OR (author_id = auth.uid()) );

DROP POLICY IF EXISTS "blog_posts_admin_delete" ON public.blog_posts;
CREATE POLICY "blog_posts_admin_delete" 
ON public.blog_posts 
FOR DELETE 
TO authenticated 
USING ( (SELECT is_admin()) OR (author_id = auth.uid()) );
