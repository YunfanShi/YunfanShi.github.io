-- 023_site_notifications.sql
-- ============================================
-- 全站通知系统
-- 管理员可创建弹窗通知（支持 HTML / Markdown），
-- 用户进入网站时自动弹出，每个通知每个用户只显示一次
-- ============================================

-- 1. 通知表
CREATE TABLE IF NOT EXISTS site_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT 'markdown' CHECK (content_type IN ('html', 'markdown')),
  is_active boolean NOT NULL DEFAULT true,
  start_time timestamptz,
  end_time timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. 用户已读/关闭记录表
CREATE TABLE IF NOT EXISTS notification_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES site_notifications(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  dismissed_at timestamptz DEFAULT now(),
  UNIQUE(notification_id, user_id)
);

-- 索引：查询活跃通知加速
CREATE INDEX IF NOT EXISTS idx_site_notifications_active
  ON site_notifications(is_active, start_time, end_time);

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE site_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_dismissals ENABLE ROW LEVEL SECURITY;

-- 所有登录用户可读启用的通知
CREATE POLICY "Anyone can read active notifications"
  ON site_notifications FOR SELECT
  USING (is_active = true);

-- 管理员可读所有通知（包括禁用的）
CREATE POLICY "Admins can read all notifications"
  ON site_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 只有管理员可写通知
CREATE POLICY "Admins can insert notifications"
  ON site_notifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update notifications"
  ON site_notifications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete notifications"
  ON site_notifications FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 用户可读取自己的关闭记录
CREATE POLICY "Users can read own dismissals"
  ON notification_dismissals FOR SELECT
  USING (auth.uid() = user_id);

-- 用户可写入自己的关闭记录
CREATE POLICY "Users can insert own dismissals"
  ON notification_dismissals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 用户可删除自己的关闭记录
CREATE POLICY "Users can delete own dismissals"
  ON notification_dismissals FOR DELETE
  USING (auth.uid() = user_id);