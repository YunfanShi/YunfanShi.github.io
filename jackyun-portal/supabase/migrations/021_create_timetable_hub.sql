-- Timetable Hub data: per-user state + config sync across devices
CREATE TABLE IF NOT EXISTS timetable_hub_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  th_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  th_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE timetable_hub_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own timetable hub data" ON timetable_hub_data
  FOR ALL USING (auth.uid() = user_id);