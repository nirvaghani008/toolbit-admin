/**
 * Shared Contact and Reply History interfaces and pure normalization utilities.
 * Usable across both Server (API routes, server actions) and Client Components.
 */

export interface ContactReplyItem {
  id: number | string;
  message: string;
  admin_email?: string;
  admin_name?: string;
  sent_at: string;
  status?: string;
}

export interface Contact {
  contact_id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  visibility?: string;
  reply_message?: ContactReplyItem[] | string | null;
  created_at: string;
  replied_at?: string;
  user_id?: string;
}

/**
 * Normalizes contact.reply_message into a structured array of reply items,
 * supporting both modern JSONB arrays and legacy text values.
 */
export function getReplyHistoryList(
  replyMessage?: ContactReplyItem[] | string | null,
  repliedAt?: string | null
): ContactReplyItem[] {
  if (!replyMessage) return [];
  if (Array.isArray(replyMessage)) return replyMessage;
  if (typeof replyMessage === 'string' && replyMessage.trim()) {
    try {
      const parsed = JSON.parse(replyMessage);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Plain text legacy fallback
    }
    return [
      {
        id: 1,
        message: replyMessage.trim(),
        admin_email: 'admin@toolbit.ai',
        admin_name: 'Admin',
        sent_at: repliedAt || new Date().toISOString(),
        status: 'replied',
      },
    ];
  }
  return [];
}

/**
 * Extracts the latest reply message text for previews.
 */
export function getLatestReplyMessage(
  replyMessage?: ContactReplyItem[] | string | null
): string | null {
  const list = getReplyHistoryList(replyMessage);
  if (list.length === 0) return null;
  return list[list.length - 1].message;
}
