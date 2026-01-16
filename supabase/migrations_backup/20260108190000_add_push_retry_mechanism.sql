-- =============================================
-- 添加推送重试机制
-- =============================================
-- 解决问题：之前推送失败后没有重试机会
-- 方案：
-- 1. 在 tasks 表添加 push_attempts 计数器
-- 2. 修改 SQL 函数，只处理 push_attempts < 3 的任务
-- 3. Edge Function 失败时增加 push_attempts，不设置 called = true
-- 4. 成功时设置 called = true

-- 1. 添加推送尝试计数列
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS push_attempts INTEGER DEFAULT 0;

-- 2. 添加最后推送错误信息（用于调试）
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS push_last_error TEXT;

-- 3. 添加最后推送尝试时间
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS push_last_attempt TIMESTAMPTZ;

-- 4. 创建索引加速查询未成功推送的任务
CREATE INDEX IF NOT EXISTS idx_tasks_push_retry
ON public.tasks(reminder_date, time, called, push_attempts)
WHERE called = false AND push_attempts < 3;

-- 5. 修改 check_and_send_task_notifications 函数
CREATE OR REPLACE FUNCTION check_and_send_task_notifications()
RETURNS VOID AS $$
DECLARE
  task_record RECORD;
  device_record RECORD;
  supabase_url TEXT;
  service_key TEXT;
  voip_sent BOOLEAN;
  fcm_sent BOOLEAN;
BEGIN
  supabase_url := 'https://ivlfsixvfovqitkajyjc.supabase.co';

  -- 从 vault 获取 service role key
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF service_key IS NULL THEN
    RAISE NOTICE '❌ Service role key not found in vault';
    RETURN;
  END IF;

  -- 查找所有到期但未调用的任务
  -- 新增条件：push_attempts < 3（最多重试3次）
  -- 新增条件：距离上次尝试超过30秒（避免重复推送）
  FOR task_record IN
    SELECT
      t.id,
      t.user_id,
      t.title,
      t.timezone,
      t.reminder_date,
      t.time,
      t.push_attempts
    FROM public.tasks t
    WHERE t.status = 'pending'
      AND t.called = false
      AND COALESCE(t.push_attempts, 0) < 3  -- 最多重试3次
      AND (t.push_last_attempt IS NULL OR t.push_last_attempt < NOW() - INTERVAL '30 seconds')  -- 避免频繁重试
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
      AND (
        CASE
          WHEN t.timezone IS NOT NULL THEN
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE t.timezone
          ELSE
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE 'UTC'
        END
      ) > NOW() - INTERVAL '30 minutes'  -- 扩大窗口以支持重试
  LOOP
    RAISE NOTICE '📋 Processing task: % (user: %, attempt: %)', task_record.title, task_record.user_id, COALESCE(task_record.push_attempts, 0) + 1;

    -- 更新推送尝试信息（在发送前更新，避免重复发送）
    UPDATE public.tasks
    SET push_attempts = COALESCE(push_attempts, 0) + 1,
        push_last_attempt = NOW()
    WHERE id = task_record.id;

    voip_sent := FALSE;
    fcm_sent := FALSE;

    -- ==================== iOS VoIP 推送 ====================
    FOR device_record IN
      SELECT device_token, is_sandbox
      FROM public.user_devices
      WHERE user_id = task_record.user_id
        AND platform = 'voip'
      ORDER BY updated_at DESC
      LIMIT 1
    LOOP
      RAISE NOTICE '📱 [iOS] Sending VoIP push for task: % (is_sandbox: %, attempt: %)',
        task_record.title, device_record.is_sandbox, COALESCE(task_record.push_attempts, 0) + 1;

      -- 调用 send-voip-push Edge Function
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
      RAISE NOTICE '✅ [iOS] VoIP push request sent for task: %', task_record.id;
    END LOOP;

    -- 如果 user_devices 没有 VoIP token，尝试从 users 表获取
    IF NOT voip_sent THEN
      FOR device_record IN
        SELECT voip_token as device_token
        FROM public.users
        WHERE id = task_record.user_id
          AND voip_token IS NOT NULL
        LIMIT 1
      LOOP
        RAISE NOTICE '📱 [iOS] Sending VoIP push (from users table) for task: %', task_record.title;

        -- 旧表没有 is_sandbox，默认使用生产环境
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
        RAISE NOTICE '✅ [iOS] VoIP push request sent for task: %', task_record.id;
      END LOOP;
    END IF;

    -- ==================== Android FCM 推送 ====================
    FOR device_record IN
      SELECT device_token
      FROM public.user_devices
      WHERE user_id = task_record.user_id
        AND platform = 'fcm'
      ORDER BY updated_at DESC
      LIMIT 1
    LOOP
      RAISE NOTICE '🤖 [Android] Sending FCM push for task: %', task_record.title;

      -- 调用 send-fcm-push Edge Function
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
      RAISE NOTICE '✅ [Android] FCM push request sent for task: %', task_record.id;
    END LOOP;

    -- 记录推送情况
    IF NOT voip_sent AND NOT fcm_sent THEN
      RAISE NOTICE '⚠️ No device token found for user: % (neither iOS nor Android)', task_record.user_id;
      -- 没有设备token，标记为已调用，避免无效重试
      UPDATE public.tasks
      SET called = true,
          push_last_error = 'No device token found'
      WHERE id = task_record.id;
    END IF;

    -- 注意：不再在这里设置 called = true
    -- Edge Function 会在推送成功后设置 called = true
    -- 如果推送失败，Edge Function 会设置 push_last_error

  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 添加注释
COMMENT ON COLUMN public.tasks.push_attempts IS '推送尝试次数，最多3次';
COMMENT ON COLUMN public.tasks.push_last_error IS '最后一次推送失败的错误信息';
COMMENT ON COLUMN public.tasks.push_last_attempt IS '最后一次推送尝试时间';
