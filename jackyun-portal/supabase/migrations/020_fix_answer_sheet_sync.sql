-- ============================================
-- Fix Answer Sheet Sync: Add consumed_by tracking
-- Reduce TTL to 15 seconds for minimal DB load
-- ============================================

-- Add consumed_by column to track which devices have processed each broadcast
ALTER TABLE IF EXISTS public.answer_sheet_broadcasts 
  ADD COLUMN IF NOT EXISTS consumed_by JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Reduce expires_at default from 30s to 15s
ALTER TABLE IF EXISTS public.answer_sheet_broadcasts 
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '15 seconds');

-- Add a broadcast_id column for deterministic deduplication
ALTER TABLE IF EXISTS public.answer_sheet_broadcasts
  ADD COLUMN IF NOT EXISTS broadcast_id TEXT;

-- Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_broadcasts_broadcast_id 
  ON public.answer_sheet_broadcasts (broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_sender_device_id 
  ON public.answer_sheet_broadcasts (sender_device_id);