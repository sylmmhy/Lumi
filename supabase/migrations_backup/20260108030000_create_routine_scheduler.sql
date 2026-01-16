-- =============================================
-- P0 修复：后端调度器 - 自动生成 routine instances
-- =============================================
-- 这个迁移解决了"电话不响"的核心问题：
-- 之前：依赖用户打开 App 才生成 routine_instance
-- 现在：后端 pg_cron 凌晨自动生成，确保提醒一定存在

-- 1. 启用 pg_cron 扩展（Supabase 已预装）
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. 创建存储过程：为所有用户生成今日 routine instances
CREATE OR REPLACE FUNCTION generate_daily_routine_instances()
RETURNS TABLE(
  user_id UUID,
  instances_created INTEGER,
  routines_skipped INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
  v_template RECORD;
  v_today DATE := CURRENT_DATE;
  v_instances_created INTEGER;
  v_routines_skipped INTEGER;
  v_existing_parent_ids UUID[];
  v_day_of_week INTEGER := EXTRACT(DOW FROM CURRENT_DATE)::INTEGER; -- 0=Sunday, 6=Saturday
BEGIN
  -- 遍历所有有 routine 的用户
  FOR v_user IN
    SELECT DISTINCT t.user_id
    FROM tasks t
    WHERE t.task_type = 'routine'
      AND t.is_recurring = true
  LOOP
    v_instances_created := 0;
    v_routines_skipped := 0;

    -- 获取该用户今日已存在的 routine_instance 的 parent_routine_id
    SELECT ARRAY_AGG(parent_routine_id) INTO v_existing_parent_ids
    FROM tasks
    WHERE tasks.user_id = v_user.user_id
      AND reminder_date = v_today
      AND task_type = 'routine_instance';

    -- 如果数组为空，设置为空数组而不是 NULL
    IF v_existing_parent_ids IS NULL THEN
      v_existing_parent_ids := ARRAY[]::UUID[];
    END IF;

    -- 遍历该用户的所有 routine 模板
    FOR v_template IN
      SELECT * FROM tasks t
      WHERE t.user_id = v_user.user_id
        AND t.task_type = 'routine'
        AND t.is_recurring = true
        AND t.id != ALL(v_existing_parent_ids) -- 排除已有今日实例的
    LOOP
      -- 检查 recurrence_days（如果设置了，只在特定日期生成）
      -- recurrence_days 格式: [0,1,2,3,4,5,6] 其中 0=周日
      IF v_template.recurrence_days IS NOT NULL
         AND array_length(v_template.recurrence_days, 1) > 0
         AND NOT (v_day_of_week = ANY(v_template.recurrence_days)) THEN
        v_routines_skipped := v_routines_skipped + 1;
        CONTINUE;
      END IF;

      -- 创建 routine_instance
      INSERT INTO tasks (
        user_id,
        title,
        time,
        display_time,
        reminder_date,
        timezone,
        status,
        task_type,
        time_category,
        called,
        is_recurring,
        parent_routine_id,
        created_at,
        updated_at
      ) VALUES (
        v_user.user_id,
        v_template.title,
        v_template.time,
        v_template.display_time,
        v_today,
        v_template.timezone,
        'pending',
        'routine_instance',
        v_template.time_category,
        false,
        false,
        v_template.id,
        NOW(),
        NOW()
      );

      v_instances_created := v_instances_created + 1;
    END LOOP;

    -- 返回这个用户的结果
    user_id := v_user.user_id;
    instances_created := v_instances_created;
    routines_skipped := v_routines_skipped;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

-- 3. 创建用于触发推送通知的表（当 routine_instance 创建后，插入到这里触发推送）
CREATE TABLE IF NOT EXISTS pending_push_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL DEFAULT 'routine_reminder',
  scheduled_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT
);

-- 索引：按状态和时间查询待发送通知
CREATE INDEX IF NOT EXISTS idx_pending_push_status_time
ON pending_push_notifications(status, scheduled_time)
WHERE status = 'pending';

-- 索引：按用户查询
CREATE INDEX IF NOT EXISTS idx_pending_push_user
ON pending_push_notifications(user_id);

-- 4. 创建触发器：当 routine_instance 创建时，自动插入待推送记录
CREATE OR REPLACE FUNCTION create_push_notification_on_routine_instance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_scheduled_time TIMESTAMPTZ;
  v_user_timezone TEXT;
BEGIN
  -- 只处理 routine_instance 类型
  IF NEW.task_type != 'routine_instance' THEN
    RETURN NEW;
  END IF;

  -- 获取用户时区，默认 UTC
  v_user_timezone := COALESCE(NEW.timezone, 'UTC');

  -- 计算提醒时间（任务日期 + 时间，转换为 UTC）
  IF NEW.time IS NOT NULL AND NEW.reminder_date IS NOT NULL THEN
    v_scheduled_time := (NEW.reminder_date || ' ' || NEW.time)::TIMESTAMP
                        AT TIME ZONE v_user_timezone;

    -- 只有未来的时间才创建推送通知
    IF v_scheduled_time > NOW() THEN
      INSERT INTO pending_push_notifications (
        user_id,
        task_id,
        notification_type,
        scheduled_time,
        status
      ) VALUES (
        NEW.user_id,
        NEW.id,
        'routine_reminder',
        v_scheduled_time,
        'pending'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_create_push_on_routine ON tasks;
CREATE TRIGGER trigger_create_push_on_routine
  AFTER INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION create_push_notification_on_routine_instance();

-- 5. 创建定时任务：每天凌晨 0:00 (UTC) 生成 routine instances
-- 注意：根据你的用户时区，可能需要调整这个时间
-- 比如用户主要在东八区，UTC 0:00 = 北京 8:00，可能要改成 UTC 16:00
SELECT cron.schedule(
  'generate-daily-routines',  -- 任务名称
  '0 0 * * *',                -- 每天 UTC 0:00
  $$SELECT * FROM generate_daily_routine_instances()$$
);

-- 6. 创建定时任务：每分钟检查并标记需要发送的推送
-- 实际发送由 Edge Function 处理
SELECT cron.schedule(
  'process-pending-notifications',
  '* * * * *',  -- 每分钟
  $$
  UPDATE pending_push_notifications
  SET status = 'ready_to_send'
  WHERE status = 'pending'
    AND scheduled_time <= NOW()
    AND retry_count < 3
  $$
);

-- 7. 创建函数：获取待发送的推送通知（供 Edge Function 调用）
CREATE OR REPLACE FUNCTION get_pending_notifications(p_limit INTEGER DEFAULT 100)
RETURNS TABLE(
  notification_id UUID,
  user_id UUID,
  task_id UUID,
  task_title TEXT,
  task_time TEXT,
  device_token TEXT,
  scheduled_time TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pn.id AS notification_id,
    pn.user_id,
    pn.task_id,
    t.title AS task_title,
    t.time AS task_time,
    ud.device_token,
    pn.scheduled_time
  FROM pending_push_notifications pn
  JOIN tasks t ON t.id = pn.task_id
  JOIN user_devices ud ON ud.user_id = pn.user_id
    AND ud.platform = 'voip'
    AND ud.is_active = true
  WHERE pn.status = 'ready_to_send'
  ORDER BY pn.scheduled_time ASC
  LIMIT p_limit;
END;
$$;

-- 8. 创建函数：标记通知已发送
CREATE OR REPLACE FUNCTION mark_notification_sent(p_notification_id UUID, p_success BOOLEAN, p_error TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_success THEN
    UPDATE pending_push_notifications
    SET status = 'sent',
        sent_at = NOW()
    WHERE id = p_notification_id;
  ELSE
    UPDATE pending_push_notifications
    SET status = CASE WHEN retry_count >= 2 THEN 'failed' ELSE 'pending' END,
        retry_count = retry_count + 1,
        error_message = p_error
    WHERE id = p_notification_id;
  END IF;
END;
$$;

-- 9. 添加 RLS 策略
ALTER TABLE pending_push_notifications ENABLE ROW LEVEL SECURITY;

-- 用户只能看到自己的通知
CREATE POLICY "Users can view own notifications" ON pending_push_notifications
  FOR SELECT USING (auth.uid() = user_id);

-- 只有 service role 可以插入/更新
CREATE POLICY "Service role can manage notifications" ON pending_push_notifications
  FOR ALL USING (auth.role() = 'service_role');

-- 10. 添加注释
COMMENT ON TABLE pending_push_notifications IS 'P0 修复：后端推送通知队列，解决电话不响问题';
COMMENT ON FUNCTION generate_daily_routine_instances IS 'P0 修复：每日凌晨由 pg_cron 调用，为所有用户生成 routine_instance';
COMMENT ON FUNCTION get_pending_notifications IS '供 Edge Function 调用，获取需要发送 VoIP 推送的通知';
