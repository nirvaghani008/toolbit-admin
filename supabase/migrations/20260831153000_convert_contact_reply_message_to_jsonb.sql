-- Migration: Convert contacts.reply_message from TEXT to JSONB for conversation history
-- Timestamp: 20260831153000

DO $$
BEGIN
  -- 1. Check if column exists and is currently of type text or character varying
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'contacts' 
      AND column_name = 'reply_message' 
      AND data_type IN ('text', 'character varying')
  ) THEN
    -- Convert column in-place to JSONB with automatic data migration of existing replies
    ALTER TABLE public.contacts 
      ALTER COLUMN reply_message TYPE JSONB 
      USING CASE 
        WHEN reply_message IS NOT NULL AND TRIM(reply_message::text) <> '' 
        THEN jsonb_build_array(
          jsonb_build_object(
            'id', 1,
            'message', TRIM(reply_message::text),
            'admin_email', 'admin@toolbit.ai',
            'admin_name', 'Admin',
            'sent_at', COALESCE(replied_at, created_at, now()),
            'status', COALESCE(status, 'replied')
          )
        )
        ELSE '[]'::jsonb
      END;

    -- Set default value to empty JSONB array
    ALTER TABLE public.contacts 
      ALTER COLUMN reply_message SET DEFAULT '[]'::jsonb;
  END IF;
END $$;
