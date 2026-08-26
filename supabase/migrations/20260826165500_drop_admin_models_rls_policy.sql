-- Migration: 20260826165500_drop_admin_models_rls_policy.sql
-- Description: Drop admin_manage_models RLS policy on models table.
-- AI Model CRUD operations are now handled server-side using the Supabase service role key with granular Admin and Sub-Admin RBAC permission checks.

DROP POLICY IF EXISTS "admin_manage_models" ON public.models;
