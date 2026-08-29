-- Migration: 20260829125000_optimize_tool_submissions_and_stats.sql
-- Description: Performance indexes for public.ai_tool_submissions and public.tool_reports to optimize sorting, status/type filtering, and lookup queries.

-- ============================================================================
-- 1. AI TOOL SUBMISSIONS PERFORMANCE INDEXES
-- ============================================================================

-- Fast index for default Last Updated sorting & 7-day sparkline date-range lookups
CREATE INDEX IF NOT EXISTS idx_ai_tool_submissions_updated_at 
ON public.ai_tool_submissions (updated_at DESC);

-- Composite index for status filtering + Last Updated sorting
CREATE INDEX IF NOT EXISTS idx_ai_tool_submissions_status_updated_at 
ON public.ai_tool_submissions (status, updated_at DESC);

-- Expression index for JSONB tool name lookups & sorting
CREATE INDEX IF NOT EXISTS idx_ai_tool_submissions_tool_info_name 
ON public.ai_tool_submissions (((tool_info->>'toolName'))) 
WHERE ((tool_info->>'toolName') IS NOT NULL);

-- ============================================================================
-- 2. TOOL REPORTS PERFORMANCE INDEXES
-- ============================================================================

-- Fast composite index for default chronological sorting & pagination (ORDER BY created_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS idx_tool_reports_created_at_id 
ON public.tool_reports (created_at DESC, id DESC);

-- Composite index for report type filtering + chronological sorting (WHERE report_type = ... ORDER BY created_at DESC)
CREATE INDEX IF NOT EXISTS idx_tool_reports_type_created_at 
ON public.tool_reports (report_type, created_at DESC);

-- ============================================================================
-- 3. ADMIN TABLES STATS & SPARKLINE PERFORMANCE INDEXES
-- ============================================================================

-- AI Tools: Fast 7-day sparkline date-range lookups and status filtering
CREATE INDEX IF NOT EXISTS idx_ai_tools_updated_at_status 
ON public.ai_tools (updated_at DESC, status);

-- Categories: Fast status count, updated_at sparkline lookups, and default chronological sorting
CREATE INDEX IF NOT EXISTS idx_categories_status_updated_at 
ON public.categories (status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_categories_updated_at 
ON public.categories (updated_at DESC, id DESC);

-- Categories: Fast text search across name, slug, and parent
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_categories_name_trgm ON public.categories USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_categories_slug_trgm ON public.categories USING gin (slug gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_categories_parent_trgm ON public.categories USING gin (parent gin_trgm_ops);

-- Categories: Fast alphabetical name sorting & pagination (ORDER BY name ASC/DESC, id ASC/DESC)
CREATE INDEX IF NOT EXISTS idx_categories_name_id 
ON public.categories (name ASC, id ASC);

-- Tags: Fast status count, updated_at sparkline lookups, and default chronological sorting
CREATE INDEX IF NOT EXISTS idx_tags_status_updated_at 
ON public.tags (status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_tags_updated_at 
ON public.tags (updated_at DESC, id DESC);

-- Tags: Fast lookup for parent tag hierarchy and relationships
CREATE INDEX IF NOT EXISTS idx_tags_parent_tag 
ON public.tags (parent_tag) 
WHERE parent_tag IS NOT NULL;

-- Tags: Fast text search across name, slug, and parent_tag
CREATE INDEX IF NOT EXISTS idx_tags_name_trgm ON public.tags USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tags_slug_trgm ON public.tags USING gin (slug gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tags_parent_tag_trgm ON public.tags USING gin (parent_tag gin_trgm_ops);

-- Tags: Fast alphabetical name sorting & pagination (ORDER BY name ASC/DESC, id ASC/DESC)
CREATE INDEX IF NOT EXISTS idx_tags_name_id 
ON public.tags (name ASC, id ASC);

-- News: Fast status count and created_at sparkline lookups
CREATE INDEX IF NOT EXISTS idx_news_created_at_status 
ON public.news (created_at DESC, status);

-- Socials: Fast status count and created_at sparkline lookups
CREATE INDEX IF NOT EXISTS idx_socials_created_at_status 
ON public.socials (created_at DESC, status);

-- Contacts: Fast status count and created_at sparkline lookups
CREATE INDEX IF NOT EXISTS idx_contacts_created_at_status 
ON public.contacts (created_at DESC, status);

-- Advertisement Tools: Fast status count and updated_at sparkline lookups
CREATE INDEX IF NOT EXISTS idx_advertisement_tools_updated_at_status 
ON public.advertisement_tools (updated_at DESC, status);

-- Reviews: Fast status count and review_date sparkline lookups
CREATE INDEX IF NOT EXISTS idx_reviews_review_date_status 
ON public.reviews (review_date DESC, status);

-- ============================================================================
-- 4. SCHEDULED LAUNCH PERFORMANCE INDEXES
-- ============================================================================

-- AI Tools: Scheduled launch date lookups and cron publication filter
CREATE INDEX IF NOT EXISTS idx_ai_tools_scheduled_launch_date
ON public.ai_tools (scheduled_launch_date)
WHERE scheduled_launch_date IS NOT NULL;

-- AI Tool Submissions: Scheduled launch date lookups
CREATE INDEX IF NOT EXISTS idx_ai_tool_submissions_scheduled_launch_date
ON public.ai_tool_submissions (scheduled_launch_date)
WHERE scheduled_launch_date IS NOT NULL;

