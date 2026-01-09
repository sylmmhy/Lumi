-- =============================================
-- 修复通知系统的三个关键问题
-- =============================================
-- 1. 重复 routine instances（添加唯一约束）
-- 2. 30分钟窗口导致任务漏掉（扩大到24小时）
-- 3. 无设备 token 时错误标记 called=true

-- =============================================
-- 问题1：清理重复的 routine instances 并添加唯一约束
-- =============================================

-- Step 1: 删除重复的 routine instances（保留最早创建的那个）
DELETE FROM tasks
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY parent_routine_id, reminder_date
        ORDER BY created_at ASC
      ) as rn
    FROM tasks
    WHERE task_type = 'routine_instance'
      AND parent_routine_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- Step 2: 添加部分唯一索引（因为 PostgreSQL 不支持在有 NULL 的列上创建普通唯一约束）
-- 这个索引确保同一个 routine 在同一天只能有一个 instance
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_routine_instance
ON tasks (parent_routine_id, reminder_date)
WHERE task_type = 'routine_instance' AND parent_routine_id IS NOT NULL;

-- =============================================
-- 问题2 & 3：修复 check_and_send_task_notifications 函数
-- =============================================
-- 修改点：
-- 1. 将30分钟窗口扩大到24小时
-- 2. 无设备 token 时不再标记 called=true

CREATE OR REPLACE FUNCTION check_and_send_task_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  task_record RECORD;
  device_record RECORD;
  supabase_url TEXT;
  service_key TEXT;
  voip_sent BOOLEAN;
  fcm_sent BOOLEAN;
BEGIN
  supabase_url := 'https://ivlfsixvfovqitkajyjc.supabase.co';

  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF service_key IS NULL THEN
    RAISE NOTICE '❌ Service role key not found in vault';
    RETURN;
  END IF;

  -- 查找到期但未成功推送的任务（最多3次尝试）
  -- 修复：将窗口从30分钟扩大到24小时，避免因 cron 中断而漏掉任务
  FOR task_record IN
    SELECT
      t.id,
      t.user_id,
      t.title,
      t.timezone,
      t.reminder_date,
      t.time,
      COALESCE(t.push_attempts, 0) as push_attempts
    FROM public.tasks t
    WHERE t.status = 'pending'
      AND t.called = false
      AND COALESCE(t.push_attempts, 0) < 3
      AND (t.push_last_attempt IS NULL OR t.push_last_attempt < NOW() - INTERVAL '30 seconds')
      AND t.reminder_date IS NOT NULL
      AND t.time IS NOT NULL
      AND (
        CASE
          WHEN t.timezone IS NOT NULL THEN
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE t.timezone
          ELSE
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE 'UTC'
        END
      ) <= NOW()
      -- 修复：从30分钟扩大到24小时
      AND (
        CASE
          WHEN t.timezone IS NOT NULL THEN
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE t.timezone
          ELSE
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE 'UTC'
        END
      ) > NOW() - INTERVAL '24 hours'
  LOOP
    RAISE NOTICE '📋 Processing task: % (user: %, attempt: %)', task_record.title, task_record.user_id, task_record.push_attempts + 1;

    UPDATE public.tasks
    SET push_attempts = COALESCE(push_attempts, 0) + 1,
        push_last_attempt = NOW()
    WHERE id = task_record.id;

    voip_sent := FALSE;
    fcm_sent := FALSE;

    -- iOS VoIP 推送
    FOR device_record IN
      SELECT device_token, is_sandbox
      FROM public.user_devices
      WHERE user_id = task_record.user_id AND platform = 'voip'
      ORDER BY updated_at DESC LIMIT 1
    LOOP
      RAISE NOTICE '📱 [iOS] Sending VoIP push (attempt %)', task_record.push_attempts + 1;

      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/send-voip-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', service_key,
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'userId', task_record.user_id,
          'taskId', task_record.id,
          'taskTitle', task_record.title,
          'deviceToken', device_record.device_token,
          'isSandbox', COALESCE(device_record.is_sandbox, false)
        )
      );
      voip_sent := TRUE;
    END LOOP;

    -- 备用：从 users 表获取 VoIP token
    IF NOT voip_sent THEN
      FOR device_record IN
        SELECT voip_token as device_token FROM public.users
        WHERE id = task_record.user_id AND voip_token IS NOT NULL LIMIT 1
      LOOP
        PERFORM net.http_post(
          url := supabase_url || '/functions/v1/send-voip-push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', service_key,
            'Authorization', 'Bearer ' || service_key
          ),
          body := jsonb_build_object(
            'userId', task_record.user_id,
            'taskId', task_record.id,
            'taskTitle', task_record.title,
            'deviceToken', device_record.device_token,
            'isSandbox', false
          )
        );
        voip_sent := TRUE;
      END LOOP;
    END IF;

    -- Android FCM 推送
    FOR device_record IN
      SELECT device_token FROM public.user_devices
      WHERE user_id = task_record.user_id AND platform = 'fcm'
      ORDER BY updated_at DESC LIMIT 1
    LOOP
      RAISE NOTICE '🤖 [Android] Sending FCM push (attempt %)', task_record.push_attempts + 1;

      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/send-fcm-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', service_key,
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'userId', task_record.user_id,
          'taskId', task_record.id,
          'taskTitle', task_record.title,
          'deviceToken', device_record.device_token
        )
      );
      fcm_sent := TRUE;
    END LOOP;

    -- 修复：如果没有设备 token，只记录错误，不标记 called=true
    -- 这样用户稍后注册 token 后，任务仍有机会被推送
    IF NOT voip_sent AND NOT fcm_sent THEN
      RAISE NOTICE '⚠️ No device token for user: %', task_record.user_id;
      UPDATE public.tasks
      SET push_last_error = 'No device token found'
      WHERE id = task_record.id;
      -- 注意：不再设置 called = true
    END IF;

  END LOOP;
END;
$function$;

-- =============================================
-- 同步修复 ensure_upcoming_routine_instances
-- =============================================
-- 添加 ON CONFLICT 处理，确保即使唯一约束触发也不会报错

CREATE OR REPLACE FUNCTION ensure_upcoming_routine_instances()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_instances_created INT := 0;
  v_routine_record RECORD;
  v_today DATE;
  v_today_dow INT;
  v_user_timezone TEXT;
  v_instance_id UUID;
BEGIN
  -- 查找需要生成实例的 routine
  FOR v_routine_record IN
    SELECT
      r.id AS routine_id,
      r.user_id,
      r.title,
      r.time,
      r.display_time,
      r.timezone,
      r.time_category,
      r.recurrence_days
    FROM public.tasks r
    WHERE r.task_type = 'routine'
      AND r.is_recurring = true
      AND r.status != 'archived'
      AND r.time IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.tasks ri
        WHERE ri.parent_routine_id = r.id
          AND ri.task_type = 'routine_instance'
          AND ri.reminder_date = (
            CASE
              WHEN r.timezone IS NOT NULL THEN
                (NOW() AT TIME ZONE r.timezone)::DATE
              ELSE
                CURRENT_DATE
            END
          )
      )
  LOOP
    v_user_timezone := COALESCE(v_routine_record.timezone, 'UTC');
    v_today := (NOW() AT TIME ZONE v_user_timezone)::DATE;
    v_today_dow := EXTRACT(DOW FROM v_today)::INT;

    -- 检查 recurrence_days
    IF v_routine_record.recurrence_days IS NOT NULL
       AND array_length(v_routine_record.recurrence_days, 1) > 0
       AND NOT (v_today_dow = ANY(v_routine_record.recurrence_days)) THEN
      CONTINUE;
    END IF;

    -- 创建 routine instance，使用 ON CONFLICT 避免重复
    INSERT INTO public.tasks (
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
      parent_routine_id
    ) VALUES (
      v_routine_record.user_id,
      v_routine_record.title,
      v_routine_record.time,
      v_routine_record.display_time,
      v_today,
      v_user_timezone,
      'pending',
      'routine_instance',
      v_routine_record.time_category,
      false,
      false,
      v_routine_record.routine_id
    )
    ON CONFLICT (parent_routine_id, reminder_date)
    WHERE task_type = 'routine_instance' AND parent_routine_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_instance_id;

    IF v_instance_id IS NOT NULL THEN
      v_instances_created := v_instances_created + 1;
      RAISE NOTICE '✅ Created instance for routine "%" (ID: %)', v_routine_record.title, v_instance_id;
    END IF;
  END LOOP;

  IF v_instances_created > 0 THEN
    RAISE NOTICE '📊 Created % routine instances', v_instances_created;
  END IF;

  RETURN v_instances_created;
END;
$function$;

-- =============================================
-- 添加说明
-- =============================================
COMMENT ON INDEX idx_unique_routine_instance IS '防止同一个 routine 在同一天生成多个 instance';
COMMENT ON FUNCTION check_and_send_task_notifications IS '检查并发送任务通知，修复：24小时窗口、无token不标记called';
COMMENT ON FUNCTION ensure_upcoming_routine_instances IS '实时生成 routine instances，使用 ON CONFLICT 防重复';
