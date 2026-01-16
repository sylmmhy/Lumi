-- =============================================
-- 修复：任务插入触发器排除即时任务
-- =============================================
-- 问题：check_task_on_insert() 函数没有排除 display_time = 'Now' 的即时任务
--       导致用户点击"现在就做"时，被触发器立即发送 VoIP 推送
-- 解决：在触发器函数开头添加检查，跳过即时任务

CREATE OR REPLACE FUNCTION check_task_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  trigger_time_utc TIMESTAMP WITH TIME ZONE;
  device_token TEXT;
  service_key TEXT;
  supabase_url TEXT := 'https://ivlfsixvfovqitkajyjc.supabase.co';
BEGIN
  -- 只处理 pending 且未调用的任务
  IF NEW.status != 'pending' OR NEW.called = true THEN
    RETURN NEW;
  END IF;

  -- 必须有 reminder_date 和 time
  IF NEW.reminder_date IS NULL OR NEW.time IS NULL THEN
    RETURN NEW;
  END IF;

  -- ========== 🆕 新增：跳过即时任务 ==========
  -- display_time = 'Now' 表示用户选择"现在就做"
  -- 这些任务用户已经在使用 AI Coach，不需要再触发 VoIP 推送
  IF COALESCE(NEW.display_time, '') = 'Now' THEN
    RAISE NOTICE '⏭️ Skipping instant task (display_time=Now): %', NEW.title;
    RETURN NEW;
  END IF;
  -- ========== 新增结束 ==========

  -- ========== 跳过新创建的 routine_instance ==========
  -- 如果是 routine_instance 且刚刚创建（2分钟以内），不触发来电
  -- 这样可以避免用户创建新 routine 时被立即打电话
  IF NEW.task_type = 'routine_instance' AND
     NEW.created_at > NOW() - INTERVAL '2 minutes' THEN
    RAISE NOTICE '⏭️ Skipping newly created routine_instance: % (will be handled by cron if needed)', NEW.title;
    RETURN NEW;
  END IF;

  -- 计算触发时间（考虑时区）
  IF NEW.timezone IS NOT NULL THEN
    trigger_time_utc := (NEW.reminder_date::text || ' ' || NEW.time || ':00')::timestamp
                        AT TIME ZONE NEW.timezone;
  ELSE
    trigger_time_utc := (NEW.reminder_date::text || ' ' || NEW.time || ':00')::timestamp
                        AT TIME ZONE 'UTC';
  END IF;

  -- 如果时间还没到，跳过（让 cron job 处理）
  IF trigger_time_utc > NOW() THEN
    RETURN NEW;
  END IF;

  RAISE NOTICE '📋 Task created with past trigger time: % (trigger: %, now: %)',
               NEW.title, trigger_time_utc, NOW();

  -- 获取用户的 VoIP token（优先从 user_devices 表）
  SELECT ud.device_token INTO device_token
  FROM user_devices ud
  WHERE ud.user_id = NEW.user_id AND ud.platform = 'voip'
  ORDER BY ud.updated_at DESC
  LIMIT 1;

  -- 如果 user_devices 没有，尝试从 users 表获取
  IF device_token IS NULL THEN
    SELECT u.voip_token INTO device_token
    FROM users u
    WHERE u.id = NEW.user_id AND u.voip_token IS NOT NULL
    LIMIT 1;
  END IF;

  IF device_token IS NULL THEN
    RAISE NOTICE '⚠️ No VoIP token found for user: %', NEW.user_id;
    RETURN NEW;
  END IF;

  -- 获取 service role key
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF service_key IS NULL THEN
    RAISE NOTICE '❌ Service role key not found';
    RETURN NEW;
  END IF;

  -- 立即发送 VoIP 推送
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-voip-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', service_key,
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'userId', NEW.user_id,
      'taskId', NEW.id,
      'taskTitle', NEW.title,
      'deviceToken', device_token
    )
  );

  RAISE NOTICE '📞 Immediate VoIP push sent for task: % (id: %)', NEW.title, NEW.id;

  RETURN NEW;
END;
$function$;

-- 添加注释
COMMENT ON FUNCTION check_task_on_insert IS 'Trigger function for immediate VoIP push. Excludes instant tasks (display_time=Now) and newly created routine_instance tasks.';
