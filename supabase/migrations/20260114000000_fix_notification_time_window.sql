-- =============================================
-- 修复通知时间窗口：从 24 小时改为 5 分钟
-- =============================================
-- 问题：24 小时窗口导致 onboarding 结束后立刻打电话
-- 解决：只在任务时间的前后 5 分钟内触发推送
--
-- 窗口逻辑：
--   任务时间 <= 当前时间（时间已到）
--   任务时间 > 当前时间 - 5分钟（不超过 5 分钟前）
--
-- 举例：任务时间 9:00
--   8:54 → 不打（还没到时间）
--   9:00 → 打电话 ✓
--   9:03 → 打电话 ✓（在 5 分钟窗口内）
--   9:06 → 不打（超过 5 分钟了）

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
  -- 修复：将窗口从 24 小时缩小到 5 分钟
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
      -- 条件1：任务时间已到（<=当前时间）
      AND (
        CASE
          WHEN t.timezone IS NOT NULL THEN
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE t.timezone
          ELSE
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE 'UTC'
        END
      ) <= NOW()
      -- 条件2：任务时间不超过 5 分钟前（修复：从 24 小时改为 5 分钟）
      AND (
        CASE
          WHEN t.timezone IS NOT NULL THEN
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE t.timezone
          ELSE
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE 'UTC'
        END
      ) > NOW() - INTERVAL '5 minutes'
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

    -- 如果没有设备 token，只记录错误，不标记 called=true
    IF NOT voip_sent AND NOT fcm_sent THEN
      RAISE NOTICE '⚠️ No device token for user: %', task_record.user_id;
      UPDATE public.tasks
      SET push_last_error = 'No device token found'
      WHERE id = task_record.id;
    END IF;

  END LOOP;
END;
$function$;

-- 添加注释
COMMENT ON FUNCTION check_and_send_task_notifications IS '检查并发送任务通知，时间窗口：任务时间后 5 分钟内';
