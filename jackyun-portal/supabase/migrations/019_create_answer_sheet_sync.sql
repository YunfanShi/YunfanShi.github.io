-- ============================================
-- Answer Sheet Sync: Broadcast channel table
-- Used for multi-device synchronization
-- ============================================

CREATE TABLE IF NOT EXISTS public.answer_sheet_broadcasts (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  sender_device_id TEXT NOT NULL,
  target_time DOUBLE PRECISION NOT NULL, -- absolute epoch ms
  payload JSONB NOT NULL, -- full answer sheet data
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 seconds')
);

-- Enable RLS (we want anyone authenticated to read/write)
ALTER TABLE public.answer_sheet_broadcasts ENABLE ROW LEVEL SECURITY;

-- Allow inserts from authenticated users
CREATE POLICY "Allow insert broadcasts"
  ON public.answer_sheet_broadcasts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow reads from authenticated users
CREATE POLICY "Allow read broadcasts"
  ON public.answer_sheet_broadcasts
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow deletes for cleanup (sender or any authenticated)
CREATE POLICY "Allow delete broadcasts"
  ON public.answer_sheet_broadcasts
  FOR DELETE
  TO authenticated
  USING (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.answer_sheet_broadcasts;

-- Cleanup index: remove expired broadcasts
CREATE INDEX IF NOT EXISTS idx_answer_sheet_broadcasts_expires 
  ON public.answer_sheet_broadcasts (expires_at);