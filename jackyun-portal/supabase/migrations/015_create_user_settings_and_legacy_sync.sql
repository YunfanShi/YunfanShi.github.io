-- user_settings table: stores per-user key/value settings (AI config, theme, etc.)
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, key)
);

-- legacy_sync_data table: stores localStorage data synced from legacy HTML pages
CREATE TABLE IF NOT EXISTS legacy_sync_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  storage_key text NOT NULL,
  storage_value jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, storage_key)
);

-- Enable Row Level Security
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_sync_data ENABLE ROW LEVEL SECURITY;

-- Policies: each user can only manage their own data
CREATE POLICY "Users can manage own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own legacy data" ON legacy_sync_data
  FOR ALL USING (auth.uid() = user_id);
