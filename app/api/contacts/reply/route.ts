import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email/transporter';
import { generateContactReplyEmail } from '@/lib/email/templates/contact-reply';
import { getReplyHistoryList, ContactReplyItem } from '@/lib/contacts';

const replyRequestSchema = z.object({
  contact_id: z.number().int().positive(),
  replyText: z.string().default(''),
  selectedStatus: z.enum(['replied', 'hide']).default('replied'),
}).superRefine((data, ctx) => {
  if (data.selectedStatus === 'replied' && !data.replyText.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please enter a reply message before marking as Replied.',
      path: ['replyText'],
    });
  }
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate admin user
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7).trim()
      : null;

    const auth = await verifyAdminPermission(token, 'contacts', 'update');
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized to reply to contacts.' },
        { status: 401 }
      );
    }

    // 2. Validate request payload
    const body = await req.json().catch(() => null);
    const parseResult = replyRequestSchema.safeParse(body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues[0]?.message || 'Invalid request payload.';
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 400 }
      );
    }

    const { contact_id, replyText, selectedStatus } = parseResult.data;

    // 3. Fetch the verified contact record from Supabase
    const { data: contact, error: fetchError } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('contact_id', contact_id)
      .single();

    if (fetchError || !contact) {
      return NextResponse.json(
        { success: false, error: 'Support inquiry record not found.' },
        { status: 404 }
      );
    }

    // 4. If status is 'replied', dispatch the email via Hostinger SMTP
    if (selectedStatus === 'replied') {
      const recipientEmail = contact.email?.trim();
      if (!recipientEmail || !recipientEmail.includes('@')) {
        return NextResponse.json(
          { success: false, error: 'Recipient inquiry does not have a valid email address.' },
          { status: 400 }
        );
      }

      // Generate branded HTML + Plain Text email template
      const emailContent = generateContactReplyEmail({
        userName: contact.name,
        userEmail: recipientEmail,
        originalSubject: contact.subject || 'Your inquiry',
        originalMessage: contact.message || '',
        replyMessage: replyText.trim(),
        submittedAt: contact.created_at,
      });

      // Dispatch through Hostinger SMTP transporter
      const sendResult = await sendEmail({
        to: recipientEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      if (!sendResult.success) {
        return NextResponse.json(
          {
            success: false,
            error: `Failed to dispatch email to ${recipientEmail}: ${sendResult.error}`,
          },
          { status: 500 }
        );
      }
    }

    // 5. Update database record in Supabase with appended JSONB history
    const existingReplies = getReplyHistoryList(contact.reply_message, contact.replied_at);
    let updatedReplies = existingReplies;
    const nowISO = new Date().toISOString();

    if (replyText.trim()) {
      const adminEmail = auth.user?.email || 'admin@toolbit.ai';
      const adminName = adminEmail.split('@')[0] || 'Admin';
      const nextId = existingReplies.length + 1;

      const newReplyItem: ContactReplyItem = {
        id: nextId,
        message: replyText.trim(),
        admin_email: adminEmail,
        admin_name: adminName.charAt(0).toUpperCase() + adminName.slice(1),
        sent_at: nowISO,
        status: selectedStatus,
      };

      updatedReplies = [...existingReplies, newReplyItem];
    }

    const { error: updateError } = await supabaseAdmin
      .from('contacts')
      .update({
        reply_message: updatedReplies,
        status: selectedStatus,
        replied_at: replyText.trim() ? nowISO : contact.replied_at,
      })
      .eq('contact_id', contact_id);

    if (updateError) {
      console.error('Database update failed after email dispatch:', updateError);
      return NextResponse.json(
        {
          success: false,
          error: 'Email was dispatched, but failed to update status in the database.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        selectedStatus === 'replied'
          ? `Response dispatched and email sent successfully to ${contact.email}.`
          : 'Inquiry updated successfully.',
    });
  } catch (err: any) {
    console.error('Unhandled error in contact reply API:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'An unexpected server error occurred.' },
      { status: 500 }
    );
  }
}
