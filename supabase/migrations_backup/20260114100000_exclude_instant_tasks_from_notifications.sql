-- =============================================
-- 修复：排除即时任务不触发推送通知
-- =============================================
-- 问题：用户在 UrgencyView 手动输入的即时任务（display_time='Now'）
--       会被后端定时任务扫描到并触发 AI 打电话
-- 解决：在查询条件中排除 display_time = 'Now' 的任务
--
-- 即时任务特征：
--   - display_time = 'Now'
--   - 用户已经在使用 AI Coach，不需要再打电话提醒

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
    RAISE NOTICE 'Service role key not found in vault';
    RETURN;
  END IF;

  -- 查找到期但未成功推送的任务（最多3次尝试）
  -- 修复：排除 display_time = 'Now' 的即时任务
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
      -- 🆕 排除即时任务：display_time = 'Now' 的任务不触发推送
      AND COALESCE(t.display_time, '') != 'Now'
      -- 条件1：任务时间已到（<=当前时间）
      AND (
        CASE
          WHEN t.timezone IS NOT NULL THEN
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE t.timezone
          ELSE
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE 'UTC'
        END
      ) <= NOW()
      -- 条件2：任务时间不超过 5 分钟前
      AND (
        CASE
          WHEN t.timezone IS NOT NULL THEN
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE t.timezone
          ELSE
            (t.reminder_date::text || ' ' || t.time || ':00')::timestamp AT TIME ZONE 'UTC'
        END
      ) > NOW() - INTERVAL '5 minutes'
  LOOP
    RAISE NOTICE 'Processing task: %', task_record.title;

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
      RAISE NOTICE 'iOS VoIP push';

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
      RAISE NOTICE 'Android FCM push';

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

    -- 如果没有设备 token，只记录错误
    IF NOT voip_sent AND NOT fcm_sent THEN
      RAISE NOTICE 'No device token for user';
      UPDATE public.tasks
      SET push_last_error = 'No device token found'
      WHERE id = task_record.id;
    END IF;

  END LOOP;
END;
$function$;

-- 添加注释
COMMENT ON FUNCTION check_and_send_task_notifications IS 'Check and send task notifications. Excludes instant tasks (display_time=Now). Time window: 5 minutes after task time';
