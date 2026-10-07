import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminPermission } from '@/lib/supabase-admin';
import {
  fetchMarketingOutreachLeads,
  type GetOutreachLeadsParams,
} from '@/lib/marketing/leads-query';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate admin user via Bearer token in Authorization header
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7).trim()
      : null;

    const auth = await verifyAdminPermission(token, 'marketing', 'view');
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized to view marketing leads.' },
        { status: 401 }
      );
    }

    // 2. Parse and sanitize query parameters
    const searchParams = req.nextUrl.searchParams;

    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeParam = parseInt(searchParams.get('pageSize') || '25', 10);

    const page = Number.isFinite(pageParam) ? Math.max(1, pageParam) : 1;
    const pageSize = Number.isFinite(pageSizeParam)
      ? Math.min(100, Math.max(10, pageSizeParam))
      : 25;

    const search = searchParams.get('search')?.trim() || undefined;
    const status = searchParams.get('status')?.trim() || undefined;
    const source = searchParams.get('source')?.trim() || undefined;
    const hasEmailOnly = searchParams.get('hasEmailOnly') === 'true';
    const hasRepliesOnly = searchParams.get('hasRepliesOnly') === 'true';
    const isToolSubmissionOnly = searchParams.get('isToolSubmissionOnly') === 'true';

    const params: GetOutreachLeadsParams = {
      page,
      pageSize,
      search,
      status,
      source,
      hasEmailOnly,
      hasRepliesOnly,
      isToolSubmissionOnly,
    };

    // 3. Fetch data securely via shared query logic
    const result = await fetchMarketingOutreachLeads(params);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error('[leads-api] Error fetching marketing leads:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to fetch marketing leads.' },
      { status: 500 }
    );
  }
}
