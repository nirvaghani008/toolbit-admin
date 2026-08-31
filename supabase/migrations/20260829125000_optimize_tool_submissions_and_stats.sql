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

-- News: Fast status count, sorting, sparkline lookups, and text search
CREATE INDEX IF NOT EXISTS idx_news_status_news_id 
ON public.news (status, news_id DESC);

CREATE INDEX IF NOT EXISTS idx_news_status_published_date 
ON public.news (status, published_date DESC);

CREATE INDEX IF NOT EXISTS idx_news_created_at 
ON public.news (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_title_trgm ON public.news USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_news_source_name_trgm ON public.news USING gin (source_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_news_summary_trgm ON public.news USING gin (summary gin_trgm_ops);

-- Blog Posts: Fast status count, updated_at sparkline lookups, and text search
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_updated_at 
ON public.blog_posts (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_blog_posts_updated_at 
ON public.blog_posts (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_blog_posts_created_at 
ON public.blog_posts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blog_posts_title_trgm ON public.blog_posts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_trgm ON public.blog_posts USING gin (slug gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_blog_posts_description_trgm ON public.blog_posts USING gin (description gin_trgm_ops);

-- AI Models: Fast status count, id sorting, release date sparklines, and text search
CREATE INDEX IF NOT EXISTS idx_models_status_id 
ON public.models (status, id DESC);

CREATE INDEX IF NOT EXISTS idx_models_id_desc 
ON public.models (id DESC);

CREATE INDEX IF NOT EXISTS idx_models_name_id 
ON public.models (name ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_models_provider_id 
ON public.models (provider, id DESC);

CREATE INDEX IF NOT EXISTS idx_models_release_date 
ON public.models (release_date DESC) 
WHERE release_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_models_name_trgm 
ON public.models USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_models_provider_trgm 
ON public.models USING gin (provider gin_trgm_ops);

-- Socials: Fast status count, id sorting/pagination, platform filtering, featured lookups, sparklines, and text search
CREATE INDEX IF NOT EXISTS idx_socials_created_at_status 
ON public.socials (created_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_socials_status_id 
ON public.socials (status, id DESC);

CREATE INDEX IF NOT EXISTS idx_socials_platform_id 
ON public.socials (platform, id DESC);

CREATE INDEX IF NOT EXISTS idx_socials_featured_id 
ON public.socials (id DESC) 
WHERE is_featured = TRUE;

CREATE INDEX IF NOT EXISTS idx_socials_source_url 
ON public.socials (source_url);

CREATE INDEX IF NOT EXISTS idx_socials_title_trgm ON public.socials USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_socials_description_trgm ON public.socials USING gin (description gin_trgm_ops);

-- Contacts: Fast status count, status filtering + chronological pagination, alphabetical sorting, sparklines, and text search
CREATE INDEX IF NOT EXISTS idx_contacts_created_at_status 
ON public.contacts (created_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_contacts_status_created_at_id 
ON public.contacts (status, created_at DESC, contact_id DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_created_at_id 
ON public.contacts (created_at DESC, contact_id DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_name_id 
ON public.contacts (name ASC, contact_id ASC);

CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON public.contacts USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm ON public.contacts USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_subject_trgm ON public.contacts USING gin (subject gin_trgm_ops);

-- Advertisement Tools: Fast status count and updated_at sparkline lookups
CREATE INDEX IF NOT EXISTS idx_advertisement_tools_updated_at_status 
ON public.advertisement_tools (updated_at DESC, status);

-- Reviews: Fast status count and review_date sparkline lookups
CREATE INDEX IF NOT EXISTS idx_reviews_review_date_status 
ON public.reviews (review_date DESC, status);

-- Newsletter Subscribers: Fast status count, status filtering + chronological pagination, sparklines, and email text search
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_created_at_id 
ON public.newsletter_subscribers (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status_created_at_id 
ON public.newsletter_subscribers (status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email_trgm 
ON public.newsletter_subscribers USING gin (email gin_trgm_ops);

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

