-- Create email_send_log table for deduplication
-- This table prevents duplicate email sends by tracking sent emails

CREATE TABLE IF NOT EXISTS email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  partner_id UUID,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message_id TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'failed', 'duplicate')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_email_send_log_user_id ON email_send_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_send_log_created_at ON email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient_subject_created ON email_send_log(user_id, recipient_email, subject, created_at DESC);

-- Enable Row Level Security
ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can insert their own email logs
CREATE POLICY "Users can insert own email logs" ON email_send_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can view their own email logs
CREATE POLICY "Users can view own email logs" ON email_send_log
  FOR SELECT
  USING (auth.uid() = user_id);
