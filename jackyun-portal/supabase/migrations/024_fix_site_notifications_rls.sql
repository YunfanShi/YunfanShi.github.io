-- 024_fix_site_notifications_rls.sql
-- ============================================
-- 修复 site_notifications RLS 权限问题
-- 问题：RLS INSERT/UPDATE/DELETE 策略只检查 profiles.role='admin'，
--       环境变量授权的管理员可能没有数据库 role，导致 RLS 拒绝。
-- 方案：统一以 profiles.role='admin' 为唯一管理员依据，
--       所有写操作通过 SECURITY DEFINER 函数执行（绕过 RLS，函数内自检管理员）。
-- ============================================

-- 1. 删除旧的 INSERT/UPDATE/DELETE 策略（写操作改由函数控制）
DROP POLICY IF EXISTS "Admins can insert notifications" ON site_notifications;
DROP POLICY IF EXISTS "Admins can update notifications" ON site_notifications;
DROP POLICY IF EXISTS "Admins can delete notifications" ON site_notifications;

-- 2. 禁止直接通过表写数据，只能通过 SECURITY DEFINER 函数
REVOKE INSERT, UPDATE, DELETE ON site_notifications FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON site_notifications FROM anon;

-- 3. 管理员内部校验函数（供各 RPC 复用）
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin_user() TO authenticated;

-- ============================================
-- 4. SECURITY DEFINER CRUD 函数
-- ============================================

-- 创建通知
CREATE OR REPLACE FUNCTION create_site_notification(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Forbidden: Admin only';
  END IF;

  INSERT INTO site_notifications (
    title,
    content,
    content_type,
    is_active,
    start_time,
    end_time,
    created_by
  ) VALUES (
    COALESCE(payload->>'title', ''),
    COALESCE(payload->>'content', ''),
    COALESCE(payload->>'content_type', 'markdown'),
    COALESCE((payload->>'is_active')::boolean, true),
    NULLIF(payload->>'start_time', '')::timestamptz,
    NULLIF(payload->>'end_time', '')::timestamptz,
    auth.uid()
  ) RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- 更新通知
CREATE OR REPLACE FUNCTION update_site_notification(p_id uuid, payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Forbidden: Admin only';
  END IF;

  UPDATE site_notifications SET
    title = COALESCE(payload->>'title', title),
    content = COALESCE(payload->>'content', content),
    content_type = COALESCE(payload->>'content_type', content_type),
    is_active = COALESCE((payload->>'is_active')::boolean, is_active),
    start_time = COALESCE(NULLIF(payload->>'start_time', '')::timestamptz, start_time),
    end_time = COALESCE(NULLIF(payload->>'end_time', '')::timestamptz, end_time),
    updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;
END;
$$;

-- 删除通知
CREATE OR REPLACE FUNCTION delete_site_notification(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Forbidden: Admin only';
  END IF;

  DELETE FROM site_notifications WHERE id = p_id;
END;
$$;

-- 列出所有通知（管理员面板用，含禁用/过期）
CREATE OR REPLACE FUNCTION list_site_notifications()
RETURNS SETOF site_notifications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM site_notifications ORDER BY created_at DESC;
$$;

-- ============================================
-- 5. 授权 authenticated 角色调用函数
-- ============================================
GRANT EXECUTE ON FUNCTION create_site_notification(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION update_site_notification(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_site_notification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION list_site_notifications() TO authenticated;

-- ============================================
-- 6. SELECT 策略保持不变
--     - 所有登录用户可读启用的通知
--     - profiles.role='admin' 可读全部（含禁用）
-- ============================================
-- （保留 023 中已创建的两条 SELECT 策略即可）