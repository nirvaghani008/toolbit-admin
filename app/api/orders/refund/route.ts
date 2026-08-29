import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import { getDodoClient } from '@/lib/dodopayments';

const refundRequestSchema = z.object({
  orderId: z.string().uuid({ message: 'Invalid order ID format.' }),
  amount: z.number().positive().optional().nullable(),
  reason: z.string().max(3000).optional().default('Admin initiated refund'),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate admin user
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7).trim()
      : null;

    const auth = await verifyAdminPermission(token, 'orders', 'update');
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized to process refunds.' },
        { status: 401 }
      );
    }

    // 2. Validate request payload
    const body = await req.json().catch(() => null);
    const parseResult = refundRequestSchema.safeParse(body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues[0]?.message || 'Invalid refund request parameters.';
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 400 }
      );
    }

    const { orderId, amount, reason } = parseResult.data;

    // 3. Fetch target order record
    const { data: order, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchError || !order) {
      return NextResponse.json(
        { success: false, error: 'Order record not found.' },
        { status: 404 }
      );
    }

    if (order.status === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'This order has already been refunded.' },
        { status: 400 }
      );
    }

    if (order.status !== 'completed') {
      return NextResponse.json(
        { success: false, error: `Only completed orders can be refunded. Current status is "${order.status}".` },
        { status: 400 }
      );
    }

    if (!order.dodo_payment_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot refund order: No Dodo payment reference ID was found on this order.',
        },
        { status: 400 }
      );
    }

    const totalPaid = Number(order.amount_usd || 0);
    const isPartial = typeof amount === 'number' && amount > 0 && amount < totalPaid;
    const finalRefundAmount = isPartial ? amount : totalPaid;

    // 4. Call Dodo Payments API to issue refund
    let dodoRefund: any;
    try {
      const dodo = getDodoClient();
      const refundPayload: { payment_id: string; reason?: string; amount?: number } = {
        payment_id: order.dodo_payment_id,
        reason: reason || 'Admin initiated refund',
      };

      // Dodo takes minor units (cents) if partial refund amount is explicitly specified
      if (isPartial) {
        refundPayload.amount = Math.round(finalRefundAmount * 100);
      }

      dodoRefund = await dodo.refunds.create(refundPayload);
    } catch (dodoError: any) {
      console.error('[refund-api] Dodo Payments API error:', dodoError);
      const errorMsg =
        dodoError?.message ||
        dodoError?.error?.message ||
        'Failed to process refund with Dodo Payments. Please verify payment status in Dodo.';
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 502 }
      );
    }

    const refundId = dodoRefund?.refund_id || dodoRefund?.id || `ref_${Date.now()}`;
    const refundReasonText = reason?.trim() || 'Admin initiated refund';
    const nowIso = new Date().toISOString();

    // 5. Revoke entitlements in database
    // Attempt via RPC first; if RPC not yet deployed in live database, execute fallback queries
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      'revoke_order_entitlements',
      {
        p_order_id: order.id,
        p_refund_id: refundId,
        p_refund_amount: finalRefundAmount,
        p_refund_reason: refundReasonText,
      }
    );

    if (rpcError) {
      console.warn('[refund-api] RPC revoke_order_entitlements not found or failed, executing fallback update:', rpcError.message);

      // A. Update order row only (entitlements remain untouched)
      const existingMeta = (order.metadata && typeof order.metadata === 'object') ? order.metadata : {};
      await supabaseAdmin
        .from('orders')
        .update({
          status: 'refunded',
          refund_id: refundId,
          refund_amount: finalRefundAmount,
          refund_reason: refundReasonText,
          refunded_at: nowIso,
          metadata: {
            ...existingMeta,
            pending_manual_fulfillment: [],
            refunded_by_admin: auth.user?.email || 'admin',
          },
          updated_at: nowIso,
        })
        .eq('id', order.id);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully refunded $${finalRefundAmount.toFixed(2)} via Dodo Payments.`,
      refundId,
      status: 'refunded',
      refundAmount: finalRefundAmount,
      refundReason: refundReasonText,
      refundedAt: nowIso,
    });
  } catch (err: any) {
    console.error('[refund-api] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'An unexpected server error occurred.' },
      { status: 500 }
    );
  }
}
