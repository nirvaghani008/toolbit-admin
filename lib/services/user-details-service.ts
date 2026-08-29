import { supabase } from '@/lib/supabase';

export interface UserProfileMeta {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  role: string;
  permissions?: Record<string, any>;
}

export interface ActivitySummary {
  saved_count: number;
  upvoted_count: number;
  submissions_count: number;
  updates_count: number;
  advertisements_count: number;
  blog_posts_count: number;
  orders_count: number;
  total_spend_usd: number;
  reviews_count: number;
  tool_reports_count: number;
  contacts_count?: number;
}

export interface SavedToolItem {
  tool_id: number;
  tool_name: string;
  tool_url: string;
  tool_site_url: string | null;
  favicon_url: string | null;
  tagline: string | null;
  status: string | null;
  pricing_model: string | null;
  collections?: string[];
}

export interface UpvotedToolItem {
  tool_id: number;
  tool_name: string;
  tool_url: string;
  tool_site_url: string | null;
  favicon_url: string | null;
  tagline: string | null;
  status: string | null;
  pricing_model: string | null;
}

export interface ToolSubmissionItem {
  id: number;
  tool_id: number | null;
  tool_name: string;
  tool_url?: string | null;
  tool_site_url: string | null;
  status: string;
  submission_tier: string | null;
  is_paid: boolean;
  created_at: string;
  updated_at: string;
  ai_approved: boolean | null;
  ai_denied_reason: string | null;
  favicon_url: string | null;
  tool_screenshot_url: string | null;
  order_id: string | null;
}

export interface ToolUpdateItem {
  id: number;
  tool_id: number | null;
  tool_name: string;
  tool_url?: string | null;
  tool_site_url: string | null;
  status: string;
  submission_tier: string | null;
  is_paid: boolean;
  created_at: string;
  updated_at: string;
  ai_approved: boolean | null;
  ai_denied_reason: string | null;
  favicon_url: string | null;
  tool_screenshot_url: string | null;
  order_id: string | null;
}

export interface AdvertisementItem {
  id: number;
  tool_id: number;
  tool_name: string;
  tool_url: string | null;
  favicon_url: string | null;
  tool_site_url: string | null;
  featured_type: string[];
  display_order: number;
  status: string;
  start_date: string;
  end_date: string | null;
  click_count: number;
  impression_count: number;
  social_share_url: string | null;
  social_platform: string | null;
  order_id: string | null;
  created_at: string;
}

export interface BlogPostItem {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  featured_image_url: string | null;
  status: string;
  submission_tier: string | null;
  view_count: number;
  reading_time_minutes: number | null;
  is_featured: boolean;
  is_paid: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_number: string;
  plan_id: string;
  amount_usd: number;
  status: string;
  payment_method: string | null;
  currency: string;
  invoice_url: string | null;
  receipt_url: string | null;
  created_at: string;
  is_paid?: boolean;
}

export interface ReviewItem {
  review_id: number;
  tool_id: number;
  tool_name: string;
  tool_url: string | null;
  tool_site_url?: string | null;
  favicon_url: string | null;
  rating: number;
  review_text: string | null;
  status: string;
  helpful_count: number;
  review_date: string;
}

export interface ToolReportItem {
  id: number;
  tool_id: number;
  tool_name: string;
  tool_url: string | null;
  tool_site_url?: string | null;
  favicon_url: string | null;
  report_type: string;
  description: string | null;
  created_at: string;
}

export interface ContactMessageItem {
  contact_id: number;
  name: string | null;
  email: string | null;
  subject: string | null;
  message: string;
  status: string;
  reply_message: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface UserFullDetails {
  profile: UserProfileMeta;
  summary: ActivitySummary;
  saved_tools: SavedToolItem[];
  upvoted_tools: UpvotedToolItem[];
  submissions: ToolSubmissionItem[];
  updates: ToolUpdateItem[];
  advertisements: AdvertisementItem[];
  blog_posts: BlogPostItem[];
  orders: OrderItem[];
  reviews: ReviewItem[];
  tool_reports: ToolReportItem[];
  contacts?: ContactMessageItem[];
}

/**
 * Optimized direct call to Supabase RPC function get_admin_user_full_details.
 * Fetches all telemetry, profiles, saved & upvoted tools, submissions, updates,
 * ads, guest posts, orders, reviews, and reports in a single round-trip.
 */
export async function fetchAdminUserDetails(userId: string): Promise<UserFullDetails> {
  const { data, error } = await supabase.rpc('get_admin_user_full_details', {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(error.message || 'Failed to fetch complete user details.');
  }

  if (!data) {
    throw new Error('User details not found or returned empty.');
  }

  return data as UserFullDetails;
}
