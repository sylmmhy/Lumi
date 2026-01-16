

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."drift_severity" AS ENUM (
    'minor',
    'moderate',
    'severe'
);


ALTER TYPE "public"."drift_severity" OWNER TO "postgres";


CREATE TYPE "public"."media_type" AS ENUM (
    'audio',
    'screenshot',
    'webcam'
);


ALTER TYPE "public"."media_type" OWNER TO "postgres";


CREATE TYPE "public"."session_state" AS ENUM (
    'active',
    'paused',
    'ended'
);


ALTER TYPE "public"."session_state" OWNER TO "postgres";


CREATE TYPE "public"."task_status" AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'archived'
);


ALTER TYPE "public"."task_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_user_streak"("p_user_id" "uuid", "p_task_keywords" "text"[]) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_streak INTEGER := 0;
  v_current_date DATE;
  v_check_date DATE;
  v_has_completion BOOLEAN;
BEGIN
  v_current_date := CURRENT_DATE;
  v_check_date := v_current_date;

  LOOP
    SELECT EXISTS (
      SELECT 1 FROM tasks
      WHERE user_id = p_user_id
        AND status = 'completed'
        AND DATE(completed_at) = v_check_date
        AND (
          EXISTS (
            SELECT 1 FROM unnest(p_task_keywords) AS keyword
            WHERE LOWER(title) LIKE '%' || LOWER(keyword) || '%'
          )
        )
    ) INTO v_has_completion;

    IF v_check_date = v_current_date AND NOT v_has_completion THEN
      v_check_date := v_check_date - INTERVAL '1 day';
      CONTINUE;
    END IF;

    IF v_has_completion THEN
      v_streak := v_streak + 1;
      v_check_date := v_check_date - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;

    IF v_current_date - v_check_date > INTERVAL '365 days' THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN v_streak;
END;
$$;


ALTER FUNCTION "public"."calculate_user_streak"("p_user_id" "uuid", "p_task_keywords" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_user_streak"("p_user_id" "uuid", "p_task_keywords" "text"[]) IS '计算用户某任务类型的连续完成天数';



CREATE OR REPLACE FUNCTION "public"."check_and_send_task_notifications"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
      AND COALESCE(t.display_time, '') != 'Now'
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
      ) > NOW() - INTERVAL '5 minutes'
  LOOP
    RAISE NOTICE 'Processing task: %', task_record.title;

    UPDATE public.tasks
    SET push_attempts = COALESCE(push_attempts, 0) + 1,
        push_last_attempt = NOW()
    WHERE id = task_record.id;

    voip_sent := FALSE;
    fcm_sent := FALSE;

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

    IF NOT voip_sent AND NOT fcm_sent THEN
      RAISE NOTICE 'No device token for user';
      UPDATE public.tasks
      SET push_last_error = 'No device token found'
      WHERE id = task_record.id;
    END IF;

  END LOOP;
END;
$$;


ALTER FUNCTION "public"."check_and_send_task_notifications"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_and_send_task_notifications"() IS 'Check and send task notifications. Excludes instant tasks (display_time=Now). Time window: 5 minutes after task time';



CREATE OR REPLACE FUNCTION "public"."check_recent_phone_call"("p_user_id" "uuid", "p_minutes_ago" integer DEFAULT 5) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    recent_call_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO recent_call_count
    FROM phone_calls
    WHERE user_id = p_user_id
        AND initiated_at > (NOW() - (p_minutes_ago || ' minutes')::INTERVAL)
        AND status IN ('initiated', 'ringing', 'answered');
    
    RETURN recent_call_count > 0;
END;
$$;


ALTER FUNCTION "public"."check_recent_phone_call"("p_user_id" "uuid", "p_minutes_ago" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_recent_phone_call"("p_user_id" "uuid", "p_minutes_ago" integer) IS 'Check if user has received a call in last N minutes (default 5)';



CREATE OR REPLACE FUNCTION "public"."check_task_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."check_task_on_insert"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_task_on_insert"() IS 'Trigger function for immediate VoIP push. Excludes instant tasks (display_time=Now) and newly created routine_instance tasks.';



CREATE OR REPLACE FUNCTION "public"."cleanup_old_data"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  -- Keep only 30 days of events
  DELETE FROM session_events WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Keep only 30 days of completed sessions
  DELETE FROM sailing_sessions WHERE state = 'ended' AND ended_at < NOW() - INTERVAL '30 days';
END;$$;


ALTER FUNCTION "public"."cleanup_old_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_old_heartbeat_images"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'heartbeat-images'
  AND created_at < (NOW() - INTERVAL '1 day');
  
  -- Log cleanup activity
  RAISE NOTICE 'Cleaned up heartbeat images older than 24 hours';
END;
$$;


ALTER FUNCTION "public"."delete_old_heartbeat_images"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_sailing_session"("session_uuid" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    session_stats RECORD;
    session_data JSONB;
    duration_secs INTEGER;
    focus_pct INTEGER;
    session_exists BOOLEAN;
BEGIN
    -- Check if session exists
    SELECT EXISTS(SELECT 1 FROM sailing_sessions WHERE id = session_uuid) INTO session_exists;
    
    IF NOT session_exists THEN
        RETURN jsonb_build_object(
            'session_id', session_uuid,
            'duration_seconds', 0,
            'focus_seconds', 0,
            'drift_seconds', 0,
            'drift_count', 0,
            'focus_percentage', 0,
            'status', 'error',
            'message', 'Session not found'
        );
    END IF;

    -- Get session statistics with explicit integer types
    SELECT * INTO session_stats FROM get_session_stats(session_uuid);
    
    -- Update session with proper integer values
    UPDATE sailing_sessions 
    SET state = 'ended',
        ended_at = CURRENT_TIMESTAMP,
        total_focus_seconds = COALESCE(session_stats.focus_seconds, 0),
        total_drift_seconds = COALESCE(session_stats.drift_seconds, 0),
        drift_count = COALESCE(session_stats.drift_count, 0)
    WHERE id = session_uuid;
    
    -- Log session end event
    INSERT INTO session_events (session_id, event_type, event_data)
    VALUES (session_uuid, 'session_end', jsonb_build_object(
        'focus_seconds', COALESCE(session_stats.focus_seconds, 0),
        'drift_seconds', COALESCE(session_stats.drift_seconds, 0),
        'drift_count', COALESCE(session_stats.drift_count, 0)
    ));
    
    -- Calculate duration and focus percentage with explicit integer casting
    SELECT 
        COALESCE(EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER, 0),
        CASE 
            WHEN (COALESCE(total_focus_seconds, 0) + COALESCE(total_drift_seconds, 0)) > 0 
            THEN ((COALESCE(total_focus_seconds, 0)::FLOAT / (COALESCE(total_focus_seconds, 0) + COALESCE(total_drift_seconds, 0))) * 100)::INTEGER 
            ELSE 0 
        END
    INTO duration_secs, focus_pct
    FROM sailing_sessions
    WHERE id = session_uuid;
    
    -- Return session summary with guaranteed integer types
    SELECT jsonb_build_object(
        'session_id', session_uuid,
        'duration_seconds', COALESCE(duration_secs, 0),
        'focus_seconds', COALESCE(session_stats.focus_seconds, 0),
        'drift_seconds', COALESCE(session_stats.drift_seconds, 0),
        'drift_count', COALESCE(session_stats.drift_count, 0),
        'focus_percentage', COALESCE(focus_pct, 0),
        'ended_at', CURRENT_TIMESTAMP,
        'status', 'completed'
    ) INTO session_data;
    
    RETURN session_data;
END;
$$;


ALTER FUNCTION "public"."end_sailing_session"("session_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_upcoming_routine_instances"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_instances_created INT := 0;
  v_routine_record RECORD;
  v_today DATE;
  v_today_dow INT;
  v_user_timezone TEXT;
  v_instance_id UUID;
BEGIN
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

    IF v_routine_record.recurrence_days IS NOT NULL
       AND array_length(v_routine_record.recurrence_days, 1) > 0
       AND NOT (v_today_dow = ANY(v_routine_record.recurrence_days)) THEN
      CONTINUE;
    END IF;

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
$$;


ALTER FUNCTION "public"."ensure_upcoming_routine_instances"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."ensure_upcoming_routine_instances"() IS '实时检查并生成缺失的 routine 实例。轻量级函数，每分钟运行。
确保新创建的 routine 立即生成今天的实例。';



CREATE OR REPLACE FUNCTION "public"."generate_daily_routine_instances"() RETURNS TABLE("user_id" "uuid", "instances_created" integer, "routines_skipped" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_user RECORD;
    v_template RECORD;
    v_today DATE := CURRENT_DATE;
    v_instances_created INTEGER;
    v_routines_skipped INTEGER;
    v_existing_parent_ids UUID[];
    v_day_of_week INTEGER := EXTRACT(DOW FROM CURRENT_DATE)::INTEGER;
  BEGIN
    FOR v_user IN
      SELECT DISTINCT t.user_id
      FROM tasks t
      WHERE t.task_type = 'routine'
        AND t.is_recurring = true
    LOOP
      v_instances_created := 0;
      v_routines_skipped := 0;

      SELECT ARRAY_AGG(parent_routine_id) INTO v_existing_parent_ids
      FROM tasks
      WHERE tasks.user_id = v_user.user_id
        AND reminder_date = v_today
        AND task_type = 'routine_instance';

      IF v_existing_parent_ids IS NULL THEN
        v_existing_parent_ids := ARRAY[]::UUID[];
      END IF;

      FOR v_template IN
        SELECT * FROM tasks t
        WHERE t.user_id = v_user.user_id
          AND t.task_type = 'routine'
          AND t.is_recurring = true
          AND t.id != ALL(v_existing_parent_ids)
      LOOP
        IF v_template.recurrence_days IS NOT NULL
           AND array_length(v_template.recurrence_days, 1) > 0
           AND NOT (v_day_of_week = ANY(v_template.recurrence_days)) THEN
          v_routines_skipped := v_routines_skipped + 1;
          CONTINUE;
        END IF;

        INSERT INTO tasks (
          user_id, title, time, display_time, reminder_date, timezone,
          status, task_type, time_category, called, is_recurring,
          parent_routine_id, created_at, updated_at
        ) VALUES (
          v_user.user_id, v_template.title, v_template.time, v_template.display_time,
          v_today, v_template.timezone, 'pending', 'routine_instance',
          v_template.time_category, false, false, v_template.id, NOW(), NOW()
        );

        v_instances_created := v_instances_created + 1;
      END LOOP;

      user_id := v_user.user_id;
      instances_created := v_instances_created;
      routines_skipped := v_routines_skipped;
      RETURN NEXT;
    END LOOP;

    RETURN;
  END;
  $$;


ALTER FUNCTION "public"."generate_daily_routine_instances"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_deep_drift_cron_status"() RETURNS TABLE("jobid" bigint, "schedule" "text", "command" "text", "active" boolean, "jobname" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.jobid,
        c.schedule,
        c.command,
        c.active,
        c.jobname
    FROM cron.job c
    WHERE c.jobname = 'deep-drift-monitoring-final';
END;
$$;


ALTER FUNCTION "public"."get_deep_drift_cron_status"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_deep_drift_cron_status"() IS 'Check the status of the deep drift monitoring cron job';



CREATE OR REPLACE FUNCTION "public"."get_or_create_google_user"("google_id_param" "text", "email_param" "text", "name_param" "text", "picture_url_param" "text", "ip_addr_param" "inet" DEFAULT NULL::"inet", "user_agent_param" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    user_uuid UUID;
BEGIN
    -- Try to find existing user by Google ID
    SELECT id INTO user_uuid
    FROM users
    WHERE google_id = google_id_param;
    
    -- If not found, create new user
    IF user_uuid IS NULL THEN
        INSERT INTO users (
            google_id, 
            email, 
            name, 
            picture_url,
            ip_address,
            user_agent,
            last_seen_at,
            created_at,
            updated_at
        )
        VALUES (
            google_id_param,
            email_param,
            name_param,
            picture_url_param,
            ip_addr_param,
            user_agent_param,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        RETURNING id INTO user_uuid;
    ELSE
        -- Update existing user's profile and activity
        UPDATE users 
        SET 
            email = email_param,
            name = name_param,
            picture_url = picture_url_param,
            ip_address = COALESCE(ip_addr_param, ip_address),
            user_agent = COALESCE(user_agent_param, user_agent),
            last_seen_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = user_uuid;
    END IF;
    
    RETURN user_uuid;
END;
$$;


ALTER FUNCTION "public"."get_or_create_google_user"("google_id_param" "text", "email_param" "text", "name_param" "text", "picture_url_param" "text", "ip_addr_param" "inet", "user_agent_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_user"("fingerprint" "text", "ip_addr" "inet" DEFAULT NULL::"inet", "user_agent_str" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    user_uuid UUID;
BEGIN
    -- Try to find existing user
    SELECT id INTO user_uuid
    FROM users
    WHERE device_fingerprint = fingerprint;
    
    -- If not found, create new user
    IF user_uuid IS NULL THEN
        INSERT INTO users (device_fingerprint, ip_address, user_agent, last_seen_at)
        VALUES (fingerprint, ip_addr, user_agent_str, CURRENT_TIMESTAMP)
        RETURNING id INTO user_uuid;
    ELSE
        -- Update last seen
        UPDATE users 
        SET last_seen_at = CURRENT_TIMESTAMP,
            ip_address = COALESCE(ip_addr, ip_address),
            user_agent = COALESCE(user_agent_str, user_agent)
        WHERE id = user_uuid;
    END IF;
    
    RETURN user_uuid;
END;
$$;


ALTER FUNCTION "public"."get_or_create_user"("fingerprint" "text", "ip_addr" "inet", "user_agent_str" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_personal_best"("p_user_id" "uuid", "p_task_keywords" "text"[]) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_personal_best INTEGER;
BEGIN
  SELECT MAX(actual_duration_minutes) INTO v_personal_best
  FROM tasks
  WHERE user_id = p_user_id
    AND status = 'completed'
    AND actual_duration_minutes IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM unnest(p_task_keywords) AS keyword
        WHERE LOWER(title) LIKE '%' || LOWER(keyword) || '%'
      )
    );

  RETURN v_personal_best;
END;
$$;


ALTER FUNCTION "public"."get_personal_best"("p_user_id" "uuid", "p_task_keywords" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_personal_best"("p_user_id" "uuid", "p_task_keywords" "text"[]) IS '获取用户某任务类型的个人最佳时长记录';



CREATE OR REPLACE FUNCTION "public"."get_recent_drift_monitor_responses"() RETURNS TABLE("id" bigint, "status_code" integer, "content" "text", "created" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.status_code,
        r.content,
        r.created
    FROM net._http_response r
    ORDER BY r.created DESC
    LIMIT 5;
END;
$$;


ALTER FUNCTION "public"."get_recent_drift_monitor_responses"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_recent_drift_monitor_responses"() IS 'Check recent HTTP responses from deep drift monitoring calls';



CREATE OR REPLACE FUNCTION "public"."get_session_stats"("session_uuid" "uuid") RETURNS TABLE("focus_seconds" integer, "drift_seconds" integer, "drift_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(CASE WHEN event_type = 'focus_period' THEN 
            (event_data->>'duration')::INTEGER ELSE 0 END), 0)::INTEGER AS focus_seconds,
        COALESCE(SUM(CASE WHEN event_type = 'drift_period' THEN 
            (event_data->>'duration')::INTEGER ELSE 0 END), 0)::INTEGER AS drift_seconds,
        COALESCE(COUNT(*) FILTER (WHERE event_type = 'drift_start'), 0)::INTEGER AS drift_count
    FROM session_events
    WHERE session_id = session_uuid;
END;
$$;


ALTER FUNCTION "public"."get_session_stats"("session_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_by_jwt_token"("token_param" "text") RETURNS TABLE("user_id" "uuid", "email" "text", "name" "text", "google_id" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    token_payload JSONB;
    user_data RECORD;
BEGIN
    -- Verify the token first
    SELECT verify_jwt_token(token_param) INTO token_payload;
    
    -- If token is invalid, return empty result
    IF NOT (token_payload->>'valid')::boolean THEN
        RETURN;
    END IF;
    
    -- Get user data
    SELECT id, email, name, google_id INTO user_data
    FROM users 
    WHERE id = (token_payload->>'user_id')::UUID;
    
    -- Return user data
    user_id := user_data.id;
    email := user_data.email;
    name := user_data.name;
    google_id := user_data.google_id;
    
    RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."get_user_by_jwt_token"("token_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_success_summary"("p_user_id" "uuid", "p_task_keywords" "text"[]) RETURNS TABLE("total_completions" integer, "current_streak" integer, "personal_best" integer, "last_completion_date" "date", "has_overcome_resistance" boolean, "has_proud_moment" boolean)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  WITH matching_tasks AS (
    SELECT t.*
    FROM tasks t
    WHERE t.user_id = p_user_id
      AND t.status = 'completed'
      AND (
        EXISTS (
          SELECT 1 FROM unnest(p_task_keywords) AS keyword
          WHERE LOWER(t.title) LIKE '%' || LOWER(keyword) || '%'
        )
      )
  )
  SELECT
    COUNT(*)::INTEGER,
    calculate_user_streak(p_user_id, p_task_keywords),
    MAX(m.actual_duration_minutes)::INTEGER,
    MAX(DATE(m.completed_at)),
    BOOL_OR(COALESCE(m.overcame_resistance, FALSE)),
    BOOL_OR(m.completion_mood = 'proud')
  FROM matching_tasks m;
END;
$$;


ALTER FUNCTION "public"."get_user_success_summary"("p_user_id" "uuid", "p_task_keywords" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_success_summary"("p_user_id" "uuid", "p_task_keywords" "text"[]) IS '获取用户成功记录摘要';



CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- 在 public.users 插入新用户记录，使用 auth.users 的 ID
  INSERT INTO public.users (
    id,
    email,
    name,
    display_name,
    created_at,
    updated_at,
    last_seen_at
  )
  VALUES (
    NEW.id,  -- 使用 auth.users 的 ID
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;  -- 如果已存在则忽略
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_auth_user"() IS '当 Supabase Auth 创建新用户时，自动在 public.users 表创建对应记录，确保 ID 一致';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- 插入到 public.users 表
  INSERT INTO public.users (
    id,
    email,
    name,
    picture_url,
    google_id,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    NULL, -- 🔁 不再写入 google_id，避免唯一索引冲突
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, public.users.name),
    picture_url = COALESCE(EXCLUDED.picture_url, public.users.picture_url),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_user"() IS '自动同步 auth.users 到 public.users，取消 google_id 唯一约束依赖，以避免登录时的重复键错误';



CREATE OR REPLACE FUNCTION "public"."log_phone_call"("p_user_id" "uuid", "p_session_id" "uuid", "p_phone_number" "text", "p_room_name" "text", "p_conversation_id" "text" DEFAULT NULL::"text", "p_context" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    call_id UUID;
BEGIN
    INSERT INTO phone_calls (
        user_id,
        session_id,
        phone_number,
        room_name,
        conversation_id,
        context,
        status
    ) VALUES (
        p_user_id,
        p_session_id,
        p_phone_number,
        p_room_name,
        p_conversation_id,
        p_context,
        'initiated'
    ) RETURNING id INTO call_id;
    
    RETURN call_id;
END;
$$;


ALTER FUNCTION "public"."log_phone_call"("p_user_id" "uuid", "p_session_id" "uuid", "p_phone_number" "text", "p_room_name" "text", "p_conversation_id" "text", "p_context" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_phone_call"("p_user_id" "uuid", "p_session_id" "uuid", "p_phone_number" "text", "p_room_name" "text", "p_conversation_id" "text", "p_context" "jsonb") IS 'Create a new phone call record and return its ID';



CREATE OR REPLACE FUNCTION "public"."process_task_notifications"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_instances_created INT;
BEGIN
  -- Step 1: 确保所有 routine 都有今天的实例
  SELECT public.ensure_upcoming_routine_instances() INTO v_instances_created;
  
  IF v_instances_created > 0 THEN
    RAISE NOTICE '📋 Pre-check: Created % missing routine instances', v_instances_created;
  END IF;
  
  -- Step 2: 检查并发送通知
  PERFORM public.check_and_send_task_notifications();
END;
$$;


ALTER FUNCTION "public"."process_task_notifications"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_task_notifications"() IS '主推送通知处理函数 - 由 check-task-notifications cron job 每分钟调用，直接查询 tasks 表并调用 send-voip-push/send-fcm-push Edge Functions';



CREATE OR REPLACE FUNCTION "public"."search_similar_memories"("p_user_id" "uuid", "p_embedding" "text", "p_tag" "text", "p_threshold" double precision DEFAULT 0.85, "p_limit" integer DEFAULT 5) RETURNS TABLE("id" "uuid", "content" "text", "tag" "text", "confidence" double precision, "similarity" double precision)
    LANGUAGE "plpgsql"
    AS $$
  DECLARE
    v_embedding vector(1536);
  BEGIN
    v_embedding := p_embedding::vector(1536);

    RETURN QUERY
    SELECT
      m.id,
      m.content,
      m.tag,
      m.confidence,
      1 - (m.embedding <=> v_embedding) as similarity
    FROM user_memories m
    WHERE m.user_id = p_user_id
      AND m.tag = p_tag
      AND m.embedding IS NOT NULL
      AND 1 - (m.embedding <=> v_embedding) >= p_threshold
    ORDER BY similarity DESC
    LIMIT p_limit;
  END;
  $$;


ALTER FUNCTION "public"."search_similar_memories"("p_user_id" "uuid", "p_embedding" "text", "p_tag" "text", "p_threshold" double precision, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_similar_memories"("p_user_id" "uuid", "p_embedding" "public"."vector", "p_tag" "text", "p_threshold" double precision DEFAULT 0.85, "p_limit" integer DEFAULT 5) RETURNS TABLE("id" "uuid", "content" "text", "tag" "text", "confidence" double precision, "similarity" double precision)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.tag,
    m.confidence,
    1 - (m.embedding <=> p_embedding) as similarity
  FROM user_memories m
  WHERE m.user_id = p_user_id
    AND m.tag = p_tag
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> p_embedding) >= p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."search_similar_memories"("p_user_id" "uuid", "p_embedding" "public"."vector", "p_tag" "text", "p_threshold" double precision, "p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_similar_memories"("p_user_id" "uuid", "p_embedding" "public"."vector", "p_tag" "text", "p_threshold" double precision, "p_limit" integer) IS '搜索语义相似的记忆，返回相似度高于阈值的记忆';



CREATE OR REPLACE FUNCTION "public"."set_config"("setting_name" "text", "setting_value" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    PERFORM set_config(setting_name, setting_value, false);
END;
$$;


ALTER FUNCTION "public"."set_config"("setting_name" "text", "setting_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_goal"("user_uuid" "uuid", "goal_text" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE users 
    SET guiding_star = goal_text,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = user_uuid;
    
    RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."set_user_goal"("user_uuid" "uuid", "goal_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_sailing_session"("user_uuid" "uuid", "task_uuid" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  session_uuid UUID;
BEGIN
  UPDATE public.sailing_sessions 
  SET state = 'ended',
      ended_at = CURRENT_TIMESTAMP
  WHERE user_id = user_uuid AND state = 'active';

  INSERT INTO public.sailing_sessions (user_id, state)
  VALUES (user_uuid, 'active')
  RETURNING id INTO session_uuid;

  INSERT INTO public.session_events (session_id, event_type, event_data)
  VALUES (session_uuid, 'session_start', jsonb_build_object('task_id', task_uuid));

  RETURN session_uuid;
END;
$$;


ALTER FUNCTION "public"."start_sailing_session"("user_uuid" "uuid", "task_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_sailing_session_v2"("user_uuid" "uuid", "task_uuids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  session_uuid UUID;
  deduped_task_ids UUID[];
  valid_task_count INTEGER;
  first_task UUID;
BEGIN
  -- End any existing active sessions for this user
  UPDATE public.sailing_sessions 
  SET state = 'ended',
      ended_at = CURRENT_TIMESTAMP
  WHERE user_id = user_uuid AND state = 'active';

  -- Create new session
  INSERT INTO public.sailing_sessions (user_id, state)
  VALUES (user_uuid, 'active')
  RETURNING id INTO session_uuid;

  -- If tasks provided, validate ownership and insert join rows
  IF task_uuids IS NOT NULL AND array_length(task_uuids, 1) > 0 THEN
    -- Deduplicate task IDs
    SELECT array_agg(DISTINCT t) INTO deduped_task_ids
    FROM unnest(task_uuids) AS t;

    -- Validate that all tasks belong to the user
    SELECT COUNT(*) INTO valid_task_count
    FROM public.tasks
    WHERE user_id = user_uuid AND id = ANY(deduped_task_ids);

    IF valid_task_count <> COALESCE(array_length(deduped_task_ids, 1), 0) THEN
      RAISE EXCEPTION 'One or more tasks do not belong to the user' USING ERRCODE = 'P0001';
    END IF;

    -- Insert join rows
    INSERT INTO public.sailing_session_tasks (session_id, task_id)
    SELECT session_uuid, t
    FROM unnest(deduped_task_ids) AS t;

    first_task := deduped_task_ids[1];
  ELSE
    deduped_task_ids := ARRAY[]::UUID[];
    first_task := NULL;
  END IF;

  -- Log session start event with both task_ids (array) and task_id (first) for compatibility
  INSERT INTO public.session_events (session_id, event_type, event_data)
  VALUES (
    session_uuid,
    'session_start',
    jsonb_build_object('task_ids', deduped_task_ids, 'task_id', first_task)
  );

  RETURN session_uuid;
END;
$$;


ALTER FUNCTION "public"."start_sailing_session_v2"("user_uuid" "uuid", "task_uuids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_memory_access"("p_memory_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE user_memories
  SET
    last_accessed_at = NOW(),
    access_count = access_count + 1
  WHERE id = ANY(p_memory_ids);
END;
$$;


ALTER FUNCTION "public"."update_memory_access"("p_memory_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_memory_access"("p_memory_ids" "uuid"[]) IS '批量更新记忆的访问记录';



CREATE OR REPLACE FUNCTION "public"."update_phone_call_status"("p_call_id" "uuid", "p_status" "text", "p_sip_call_id" "text" DEFAULT NULL::"text", "p_sip_participant_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE phone_calls
    SET 
        status = p_status,
        sip_call_id = COALESCE(p_sip_call_id, sip_call_id),
        sip_participant_id = COALESCE(p_sip_participant_id, sip_participant_id),
        answered_at = CASE WHEN p_status = 'answered' THEN NOW() ELSE answered_at END,
        ended_at = CASE WHEN p_status IN ('ended', 'failed') THEN NOW() ELSE ended_at END,
        duration_seconds = CASE 
            WHEN p_status IN ('ended', 'failed') AND answered_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (NOW() - answered_at))::INTEGER
            ELSE duration_seconds
        END
    WHERE id = p_call_id;
END;
$$;


ALTER FUNCTION "public"."update_phone_call_status"("p_call_id" "uuid", "p_status" "text", "p_sip_call_id" "text", "p_sip_participant_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_phone_call_status"("p_call_id" "uuid", "p_status" "text", "p_sip_call_id" "text", "p_sip_participant_id" "text") IS 'Update phone call status and automatically set timestamps';



CREATE OR REPLACE FUNCTION "public"."update_reminders_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_reminders_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_session_activity"("session_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE sailing_sessions 
    SET last_activity_at = CURRENT_TIMESTAMP
    WHERE id = session_uuid AND state = 'active';
    
    -- Return true if session was found and updated
    RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."update_session_activity"("session_uuid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_session_activity"("session_uuid" "uuid") IS 'Updates the last_activity_at timestamp for a session to indicate user activity';



CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_memories_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_memories_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_user_device"("p_user_id" "uuid", "p_device_token" "text", "p_device_type" "text", "p_platform" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO user_devices (user_id, device_token, device_type, platform, updated_at)
  VALUES (p_user_id, p_device_token, p_device_type, p_platform, NOW())
  ON CONFLICT (user_id, platform)
  DO UPDATE SET
    device_token = EXCLUDED.device_token,
    device_type = EXCLUDED.device_type,
    updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."upsert_user_device"("p_user_id" "uuid", "p_device_token" "text", "p_device_type" "text", "p_platform" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_user_device_improved"("p_user_id" "uuid", "p_device_token" "text", "p_device_type" "text", "p_platform" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- 首先，删除其他用户的相同 device_token（一个设备只能属于一个用户）
  DELETE FROM user_devices 
  WHERE device_token = p_device_token 
  AND user_id != p_user_id;
  
  -- 然后，插入或更新当前用户的记录
  INSERT INTO user_devices (user_id, device_token, device_type, platform, updated_at)
  VALUES (p_user_id, p_device_token, p_device_type, p_platform, NOW())
  ON CONFLICT (user_id, platform)
  DO UPDATE SET
    device_token = EXCLUDED.device_token,
    device_type = EXCLUDED.device_type,
    updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."upsert_user_device_improved"("p_user_id" "uuid", "p_device_token" "text", "p_device_type" "text", "p_platform" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_jwt_token"("token_param" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    token_payload JSONB;
    user_exists BOOLEAN;
    user_data RECORD;
BEGIN
    -- For now, we'll implement basic JWT validation
    -- In production, this would use Supabase's built-in JWT verification
    -- or a proper JWT library like pgjwt
    
    -- Basic token format validation
    IF token_param IS NULL OR length(token_param) < 10 THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Invalid token format');
    END IF;
    
    -- For this implementation, we'll assume the token contains user_id
    -- In production, you would decode and verify the JWT signature here
    -- This is a simplified version for demonstration
    
    -- Extract user_id from token (this is a placeholder - real implementation would decode JWT)
    -- For now, we'll use a simple approach where we assume the token contains the user_id
    -- In production, use proper JWT decoding and verification
    
    -- Check if user exists (this is a simplified validation)
    -- In production, you would decode the JWT and extract the user_id from the payload
    SELECT EXISTS(
        SELECT 1 FROM users 
        WHERE google_id IS NOT NULL
        LIMIT 1
    ) INTO user_exists;
    
    IF NOT user_exists THEN
        RETURN jsonb_build_object('valid', false, 'error', 'No Google users found');
    END IF;
    
    -- Get user data for the first Google user (simplified for demo)
    -- In production, you would extract the actual user_id from the JWT payload
    SELECT id, email, name INTO user_data
    FROM users 
    WHERE google_id IS NOT NULL
    LIMIT 1;
    
    RETURN jsonb_build_object(
        'valid', true,
        'user_id', user_data.id,
        'email', user_data.email,
        'name', user_data.name
    );
END;
$$;


ALTER FUNCTION "public"."verify_jwt_token"("token_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_jwt_user"("jwt_token" "text") RETURNS TABLE("user_id" "uuid", "email" "text", "name" "text", "is_valid" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    user_record RECORD;
    token_payload JSONB;
BEGIN
    -- For now, we'll implement basic JWT verification
    -- In production, you'd want to use a proper JWT library
    -- This is a simplified version for the initial implementation
    
    -- Extract user_id from JWT (this is a placeholder - real implementation would verify signature)
    -- For now, we'll assume the JWT contains user_id in the payload
    -- In a real implementation, you'd decode and verify the JWT signature
    
    -- This is a simplified approach - in production you'd use a proper JWT library
    -- For now, we'll return a mock response
    -- TODO: Implement proper JWT verification
    
    -- Placeholder implementation
    user_id := NULL;
    email := NULL;
    name := NULL;
    is_valid := FALSE;
    
    RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."verify_jwt_user"("jwt_token" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."SailingLog" (
    "sailinglog_id" bigint NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "user_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transcribed_text" "text" NOT NULL,
    "source" "text"
);


ALTER TABLE "public"."SailingLog" OWNER TO "postgres";


ALTER TABLE "public"."SailingLog" ALTER COLUMN "sailinglog_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."SailingLog_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."active_sessions_view" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"uuid" AS "user_id",
    NULL::"public"."session_state" AS "state",
    NULL::timestamp with time zone AS "started_at",
    NULL::timestamp with time zone AS "ended_at",
    NULL::integer AS "total_focus_seconds",
    NULL::integer AS "total_drift_seconds",
    NULL::integer AS "drift_count",
    NULL::"jsonb" AS "summary",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::timestamp with time zone AS "last_activity_at",
    NULL::"text" AS "device_fingerprint",
    NULL::"text" AS "display_name",
    NULL::"text" AS "task_titles";


ALTER TABLE "public"."active_sessions_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "drift_event_id" "uuid",
    "messages" "jsonb" NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "channel" "text" DEFAULT 'web'::"text",
    "phone_call_id" "uuid"
);


ALTER TABLE "public"."ai_conversations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ai_conversations"."channel" IS 'Channel where conversation happened: web or phone';



COMMENT ON COLUMN "public"."ai_conversations"."phone_call_id" IS 'Links to phone_calls record if conversation was via phone';



CREATE TABLE IF NOT EXISTS "public"."animation_queue" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "animation_name" "text" NOT NULL,
    "trigger_data" "jsonb" DEFAULT '{}'::"jsonb",
    "played" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."animation_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_summaries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "total_focus_seconds" integer DEFAULT 0,
    "total_drift_seconds" integer DEFAULT 0,
    "tasks_completed" integer DEFAULT 0,
    "tasks_created" integer DEFAULT 0,
    "ai_interventions" integer DEFAULT 0,
    "summary_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."daily_summaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drift_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_drifting" boolean NOT NULL,
    "drift_reason" "text",
    "actual_task" "text",
    "intervention_triggered" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "detected_task_id" "uuid",
    "detected_task_title" "text",
    "screen_file_id" "text",
    "encouragement" "text",
    "is_false_detection" boolean DEFAULT false NOT NULL,
    "trigger_reason" "text",
    "is_idle" boolean,
    "progress_step" "text",
    "key_on_screen_information" "text"
);


ALTER TABLE "public"."drift_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."drift_events" IS 'Per-minute focus monitoring log for distraction detection system';



COMMENT ON COLUMN "public"."drift_events"."is_drifting" IS 'Whether user was detected as drifting during this heartbeat';



COMMENT ON COLUMN "public"."drift_events"."drift_reason" IS 'Dify explanation for the focus assessment';



COMMENT ON COLUMN "public"."drift_events"."actual_task" IS 'What Dify detected the user was actually doing';



COMMENT ON COLUMN "public"."drift_events"."intervention_triggered" IS 'Whether this record triggered an AI intervention';



COMMENT ON COLUMN "public"."drift_events"."encouragement" IS 'Short motivational message for the user';



COMMENT ON COLUMN "public"."drift_events"."is_false_detection" IS 'Whether this detection was later marked as a wrong/false detection';



COMMENT ON COLUMN "public"."drift_events"."is_idle" IS 'Whether user was detected as idle during this heartbeat (from Dify is_idle output)';



COMMENT ON COLUMN "public"."drift_events"."progress_step" IS 'Current progress step or phase detected by AI (e.g., "Writing and reviewing test request")';



COMMENT ON COLUMN "public"."drift_events"."key_on_screen_information" IS 'Key information visible on screen during detection, including open files, visible UI elements, and context';



CREATE TABLE IF NOT EXISTS "public"."false_detect_exceptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "actual_task" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."false_detect_exceptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goal" (
    "user_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "goal_text" "text" NOT NULL
);


ALTER TABLE "public"."goal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interview_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'pending'::"text"
);


ALTER TABLE "public"."interview_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_session" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "session_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "task_initiated_at" timestamp with time zone,
    "task_ended_at" timestamp with time zone,
    "pre_start_duration_seconds" integer,
    "chat_duration_seconds" integer,
    "work_duration_seconds" integer,
    "total_duration_seconds" integer,
    "task_description" "text",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "device_id" "text",
    "visitor_id" "uuid",
    "ip_address_hash" "text",
    CONSTRAINT "onboarding_session_status_check" CHECK (("status" = ANY (ARRAY['opened'::"text", 'started'::"text", 'task_initiated'::"text", 'task_completed'::"text", 'task_abandoned'::"text", 'failed_timeout'::"text"])))
);


ALTER TABLE "public"."onboarding_session" OWNER TO "postgres";


COMMENT ON COLUMN "public"."onboarding_session"."visitor_id" IS 'Links to anonymous visitor for tracking "one free trial per device" rule. Populated for anonymous users before signup.';



COMMENT ON COLUMN "public"."onboarding_session"."ip_address_hash" IS 'IP地址的SHA256哈希值，用于监控滥用行为但保护隐私（符合GDPR要求）。不可逆推出原始IP。';



CREATE TABLE IF NOT EXISTS "public"."phone_calls" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "conversation_id" "text",
    "room_name" "text" NOT NULL,
    "sip_call_id" "text",
    "sip_participant_id" "text",
    "phone_number" "text" NOT NULL,
    "status" "text" DEFAULT 'initiated'::"text",
    "duration_seconds" integer,
    "trigger_reason" "text" DEFAULT 'drift_detection'::"text",
    "context" "jsonb" DEFAULT '{}'::"jsonb",
    "initiated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "answered_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."phone_calls" OWNER TO "postgres";


COMMENT ON TABLE "public"."phone_calls" IS 'Tracks all outbound phone calls for drift intervention';



COMMENT ON COLUMN "public"."phone_calls"."conversation_id" IS 'Links to Dify conversation for continuity across web/phone';



COMMENT ON COLUMN "public"."phone_calls"."room_name" IS 'LiveKit room name where call happened';



COMMENT ON COLUMN "public"."phone_calls"."status" IS 'Call lifecycle: initiated → ringing → answered → ended OR failed';



CREATE TABLE IF NOT EXISTS "public"."routine_completions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "completion_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "task_name" "text",
    "user_email" "text"
);


ALTER TABLE "public"."routine_completions" OWNER TO "postgres";


COMMENT ON TABLE "public"."routine_completions" IS 'Routine 任务的每日完成记录。RLS 已禁用，应用层负责用户权限验证。';



COMMENT ON COLUMN "public"."routine_completions"."user_id" IS '用户 ID';



COMMENT ON COLUMN "public"."routine_completions"."task_id" IS '关联的 Routine 任务 ID';



COMMENT ON COLUMN "public"."routine_completions"."completion_date" IS '完成日期 (YYYY-MM-DD)';



COMMENT ON COLUMN "public"."routine_completions"."task_name" IS '任务名称（冗余存储，方便查询）';



COMMENT ON COLUMN "public"."routine_completions"."user_email" IS '用户邮箱（冗余存储，方便查询）';



CREATE TABLE IF NOT EXISTS "public"."sailing_session_tasks" (
    "session_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sailing_session_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sailing_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "state" "public"."session_state" DEFAULT 'active'::"public"."session_state",
    "started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "ended_at" timestamp with time zone,
    "total_focus_seconds" integer DEFAULT 0,
    "total_drift_seconds" integer DEFAULT 0,
    "drift_count" integer DEFAULT 0,
    "summary" "jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "tasks_snapshot" "jsonb",
    "idle_count" integer DEFAULT 0,
    CONSTRAINT "check_session_dates" CHECK ((("ended_at" IS NULL) OR ("ended_at" >= "started_at")))
);


ALTER TABLE "public"."sailing_sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."sailing_sessions"."last_activity_at" IS 'Timestamp of last user activity in this session, used for inactivity detection';



COMMENT ON COLUMN "public"."sailing_sessions"."tasks_snapshot" IS 'Snapshot of tasks at session start/end time. Array of {id, title, description, priority, status}';



COMMENT ON COLUMN "public"."sailing_sessions"."idle_count" IS 'Total number of times user was detected as idle during this session';



CREATE TABLE IF NOT EXISTS "public"."schema_versions" (
    "version" integer NOT NULL,
    "description" "text",
    "applied_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."schema_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."session_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "source_thought_id" "uuid",
    "priority" integer DEFAULT 2,
    "status" "public"."task_status" DEFAULT 'pending'::"public"."task_status",
    "due_date" "date",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "category" "text",
    "order_index" integer DEFAULT 0,
    "time" character varying,
    "display_time" character varying,
    "reminder_date" "date",
    "task_type" "text",
    "time_category" "text",
    "called" boolean DEFAULT false,
    "is_recurring" boolean DEFAULT false,
    "recurrence_pattern" "text",
    "recurrence_days" integer[],
    "recurrence_end_date" "date",
    "timezone" character varying,
    "parent_routine_id" "uuid",
    "push_attempts" integer DEFAULT 0,
    "push_last_error" "text",
    "push_last_attempt" timestamp with time zone,
    "completion_mood" "text",
    "difficulty_perception" "text",
    "overcame_resistance" boolean DEFAULT false,
    "actual_duration_minutes" integer,
    "personal_best_at_completion" integer,
    CONSTRAINT "tasks_category_check" CHECK (("category" = ANY (ARRAY['important_urgent'::"text", 'important_not_urgent'::"text", 'not_important_urgent'::"text", 'not_important_not_urgent'::"text"]))),
    CONSTRAINT "tasks_completion_mood_check" CHECK ((("completion_mood" IS NULL) OR ("completion_mood" = ANY (ARRAY['proud'::"text", 'relieved'::"text", 'satisfied'::"text", 'neutral'::"text"])))),
    CONSTRAINT "tasks_difficulty_perception_check" CHECK ((("difficulty_perception" IS NULL) OR ("difficulty_perception" = ANY (ARRAY['easier_than_usual'::"text", 'normal'::"text", 'harder_than_usual'::"text"])))),
    CONSTRAINT "tasks_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 4))),
    CONSTRAINT "tasks_recurrence_pattern_check" CHECK (("recurrence_pattern" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text", 'custom'::"text"]))),
    CONSTRAINT "tasks_task_type_check" CHECK (("task_type" = ANY (ARRAY['todo'::"text", 'routine'::"text", 'routine_instance'::"text"]))),
    CONSTRAINT "tasks_time_category_check" CHECK (("time_category" = ANY (ARRAY['morning'::"text", 'noon'::"text", 'afternoon'::"text", 'evening'::"text", 'latenight'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tasks"."priority" IS 'Eisenhower Matrix priority: 1=Important+Urgent, 2=Important+NotUrgent, 3=NotImportant+Urgent, 4=NotImportant+NotUrgent';



COMMENT ON COLUMN "public"."tasks"."due_date" IS 'Optional due date for the task';



COMMENT ON COLUMN "public"."tasks"."completed_at" IS 'Timestamp when task was marked as completed';



COMMENT ON COLUMN "public"."tasks"."category" IS 'Optional task category for grouping';



COMMENT ON COLUMN "public"."tasks"."order_index" IS 'Order index for task sorting within priority/category';



COMMENT ON COLUMN "public"."tasks"."time" IS '提醒时间 (HH:mm 格式, 24小时制)';



COMMENT ON COLUMN "public"."tasks"."display_time" IS '显示时间 (12小时制带 am/pm)';



COMMENT ON COLUMN "public"."tasks"."reminder_date" IS '提醒日期';



COMMENT ON COLUMN "public"."tasks"."task_type" IS '任务类型: todo (一次性) 或 routine (重复任务)';



COMMENT ON COLUMN "public"."tasks"."time_category" IS '时间分类: morning/afternoon/evening';



COMMENT ON COLUMN "public"."tasks"."called" IS 'AI 是否已经打电话提醒过用户';



COMMENT ON COLUMN "public"."tasks"."is_recurring" IS '是否为重复任务';



COMMENT ON COLUMN "public"."tasks"."recurrence_pattern" IS '重复模式: daily(每天)/weekly(每周)/monthly(每月)/custom(自定义)';



COMMENT ON COLUMN "public"."tasks"."recurrence_days" IS '每周重复的日期数组 (0=周日, 6=周六)';



COMMENT ON COLUMN "public"."tasks"."recurrence_end_date" IS '重复任务的结束日期';



COMMENT ON COLUMN "public"."tasks"."timezone" IS '任务创建时的用户时区 (例如: Asia/Shanghai, America/New_York)。如果为 NULL，则使用设备当前时区。';



COMMENT ON COLUMN "public"."tasks"."parent_routine_id" IS 'For routine instances, this points to the parent routine template. NULL for standalone tasks and routine templates.';



COMMENT ON COLUMN "public"."tasks"."completion_mood" IS '任务完成时的情绪: proud=骄傲, relieved=如释重负, satisfied=满足, neutral=一般';



COMMENT ON COLUMN "public"."tasks"."difficulty_perception" IS '难度感知: easier_than_usual=比平时简单, normal=正常, harder_than_usual=比平时难';



COMMENT ON COLUMN "public"."tasks"."overcame_resistance" IS '是否克服了阻力（一开始不想做但最终完成了）';



COMMENT ON COLUMN "public"."tasks"."actual_duration_minutes" IS '实际完成时长（分钟）';



COMMENT ON COLUMN "public"."tasks"."personal_best_at_completion" IS '完成时的个人最佳记录（分钟），用于判断是否创造新纪录';



COMMENT ON CONSTRAINT "tasks_task_type_check" ON "public"."tasks" IS 'Allowed task types: todo (one-time), routine (template), routine_instance (daily instance of routine)';



CREATE TABLE IF NOT EXISTS "public"."test_version_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'pending'::"text"
);


ALTER TABLE "public"."test_version_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "device_token" "text" NOT NULL,
    "device_type" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_sandbox" boolean DEFAULT false,
    "live_activity_token" "text",
    "live_activity_token_sandbox" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    CONSTRAINT "user_devices_device_type_check" CHECK (("device_type" = ANY (ARRAY['ios'::"text", 'android'::"text"]))),
    CONSTRAINT "user_devices_platform_check" CHECK (("platform" = ANY (ARRAY['voip'::"text", 'apns'::"text", 'fcm'::"text"])))
);


ALTER TABLE "public"."user_devices" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_devices" IS '用户设备推送 token 表，用于发送 VoIP 和普通推送';



COMMENT ON COLUMN "public"."user_devices"."device_token" IS 'APNs VoIP token 或 FCM token';



COMMENT ON COLUMN "public"."user_devices"."device_type" IS '设备类型: ios 或 android';



COMMENT ON COLUMN "public"."user_devices"."platform" IS '推送平台: voip (iOS CallKit), apns (iOS 普通推送), fcm (Android)';



COMMENT ON COLUMN "public"."user_devices"."is_sandbox" IS 'true = 沙盒环境(Xcode开发), false = 生产环境(TestFlight/App Store)';



COMMENT ON COLUMN "public"."user_devices"."live_activity_token" IS 'iOS Live Activity Push-to-Start token';



COMMENT ON COLUMN "public"."user_devices"."live_activity_token_sandbox" IS 'true = 沙盒环境(Xcode开发), false = 生产环境(TestFlight/App Store)';



COMMENT ON COLUMN "public"."user_devices"."is_active" IS 'Whether this device is active and should receive push notifications';



CREATE TABLE IF NOT EXISTS "public"."user_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "content" "text",
    "contact_info" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "rating" integer,
    CONSTRAINT "user_feedback_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."user_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_memories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "tag" "text" NOT NULL,
    "confidence" double precision DEFAULT 0.5 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "task_name" "text",
    "embedding" "public"."vector"(1536),
    "last_accessed_at" timestamp with time zone,
    "access_count" integer DEFAULT 0,
    "merged_from" "uuid"[] DEFAULT '{}'::"uuid"[],
    CONSTRAINT "user_memories_confidence_check" CHECK ((("confidence" >= (0)::double precision) AND ("confidence" <= (1)::double precision))),
    CONSTRAINT "user_memories_tag_check" CHECK (("tag" = ANY (ARRAY['PREF'::"text", 'PROC'::"text", 'SOMA'::"text", 'EMO'::"text", 'SAB'::"text", 'EFFECTIVE'::"text"])))
);


ALTER TABLE "public"."user_memories" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_memories" IS '用户行为模式和偏好记忆，由 AI 从对话中提取';



COMMENT ON COLUMN "public"."user_memories"."tag" IS 'PREF=AI交互偏好, PROC=拖延原因, SOMA=身心模式, EMO=情绪触发, SAB=自我破坏, EFFECTIVE=有效激励方式';



COMMENT ON COLUMN "public"."user_memories"."confidence" IS 'AI 提取的置信度 0-1';



COMMENT ON COLUMN "public"."user_memories"."embedding" IS '记忆内容的向量嵌入，用于语义相似度搜索';



COMMENT ON COLUMN "public"."user_memories"."last_accessed_at" IS '最后一次被检索使用的时间';



COMMENT ON COLUMN "public"."user_memories"."access_count" IS '被检索使用的次数';



COMMENT ON COLUMN "public"."user_memories"."merged_from" IS '如果是合并记忆，记录来源记忆的ID';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "display_name" "text",
    "guiding_star" "text",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb",
    "first_seen_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "google_id" "text",
    "email" "text",
    "name" "text",
    "picture_url" "text",
    "ip_address" "inet",
    "device_fingerprint" "text",
    "has_seen_screen_share_onboarding" boolean DEFAULT false,
    "voip_token" "text",
    "voip_token_updated_at" timestamp with time zone,
    "has_completed_habit_onboarding" boolean DEFAULT false
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."google_id" IS 'Google OAuth ID for users who sign in with Google';



COMMENT ON COLUMN "public"."users"."email" IS 'User email address from Google OAuth or anonymous signup';



COMMENT ON COLUMN "public"."users"."name" IS 'User display name from Google OAuth or user input';



COMMENT ON COLUMN "public"."users"."picture_url" IS 'User profile picture URL from Google OAuth';



COMMENT ON COLUMN "public"."users"."has_seen_screen_share_onboarding" IS 'Tracks whether the user has completed the screen sharing onboarding flow';



COMMENT ON COLUMN "public"."users"."voip_token" IS 'iOS VoIP Push token for CallKit incoming calls';



COMMENT ON COLUMN "public"."users"."voip_token_updated_at" IS 'Timestamp when VoIP token was last updated';



COMMENT ON COLUMN "public"."users"."has_completed_habit_onboarding" IS '用户是否完成了新用户习惯引导流程';



CREATE TABLE IF NOT EXISTS "public"."visitors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "has_completed_onboarding" boolean DEFAULT false NOT NULL,
    "last_completed_onboarding_at" timestamp with time zone,
    "ip_address" "inet",
    "user_agent" "text",
    "device_fingerprint" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."visitors" OWNER TO "postgres";


COMMENT ON TABLE "public"."visitors" IS 'Tracks anonymous visitors for managing "one free trial per device" onboarding rule';



COMMENT ON COLUMN "public"."visitors"."id" IS 'Unique visitor ID, stored in frontend localStorage/cookie';



COMMENT ON COLUMN "public"."visitors"."has_completed_onboarding" IS 'Whether this visitor has completed at least one onboarding trial (reached celebration screen)';



COMMENT ON COLUMN "public"."visitors"."last_completed_onboarding_at" IS 'Timestamp when visitor last completed an onboarding trial';



COMMENT ON COLUMN "public"."visitors"."device_fingerprint" IS 'Optional browser fingerprint for additional tracking (e.g., from FingerprintJS)';



COMMENT ON COLUMN "public"."visitors"."metadata" IS 'Extensible JSON field for storing additional visitor information';



CREATE TABLE IF NOT EXISTS "public"."voice_thoughts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "audio_url" "text",
    "transcript" "text",
    "duration_seconds" integer,
    "processed" boolean DEFAULT false,
    "extracted_tasks" "uuid"[],
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."voice_thoughts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."SailingLog"
    ADD CONSTRAINT "SailingLog_id_key" UNIQUE ("sailinglog_id");



ALTER TABLE ONLY "public"."SailingLog"
    ADD CONSTRAINT "SailingLog_pkey" PRIMARY KEY ("sailinglog_id");



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."animation_queue"
    ADD CONSTRAINT "animation_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_summaries"
    ADD CONSTRAINT "daily_summaries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_summaries"
    ADD CONSTRAINT "daily_summaries_user_id_date_key" UNIQUE ("user_id", "date");



ALTER TABLE ONLY "public"."drift_events"
    ADD CONSTRAINT "drift_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."false_detect_exceptions"
    ADD CONSTRAINT "false_detect_exceptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal"
    ADD CONSTRAINT "goal_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."interview_leads"
    ADD CONSTRAINT "interview_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_session"
    ADD CONSTRAINT "onboarding_session_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_session"
    ADD CONSTRAINT "onboarding_session_session_id_key" UNIQUE ("session_id");



ALTER TABLE ONLY "public"."phone_calls"
    ADD CONSTRAINT "phone_calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."routine_completions"
    ADD CONSTRAINT "routine_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."routine_completions"
    ADD CONSTRAINT "routine_completions_task_id_completion_date_key" UNIQUE ("task_id", "completion_date");



ALTER TABLE ONLY "public"."sailing_session_tasks"
    ADD CONSTRAINT "sailing_session_tasks_pkey" PRIMARY KEY ("session_id", "task_id");



ALTER TABLE ONLY "public"."sailing_sessions"
    ADD CONSTRAINT "sailing_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schema_versions"
    ADD CONSTRAINT "schema_versions_pkey" PRIMARY KEY ("version");



ALTER TABLE ONLY "public"."session_events"
    ADD CONSTRAINT "session_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_version_requests"
    ADD CONSTRAINT "test_version_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_user_id_device_token_key" UNIQUE ("user_id", "device_token");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_user_id_platform_key" UNIQUE ("user_id", "platform");



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_memories"
    ADD CONSTRAINT "user_memories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_google_id_key" UNIQUE ("google_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visitors"
    ADD CONSTRAINT "visitors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."voice_thoughts"
    ADD CONSTRAINT "voice_thoughts_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_ai_conversations_channel" ON "public"."ai_conversations" USING "btree" ("channel", "created_at" DESC);



CREATE INDEX "idx_ai_conversations_drift_event_id" ON "public"."ai_conversations" USING "btree" ("drift_event_id");



CREATE INDEX "idx_ai_conversations_phone_call_id" ON "public"."ai_conversations" USING "btree" ("phone_call_id");



CREATE INDEX "idx_ai_conversations_session_id" ON "public"."ai_conversations" USING "btree" ("session_id");



CREATE INDEX "idx_ai_conversations_user" ON "public"."ai_conversations" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_animation_queue_unplayed" ON "public"."animation_queue" USING "btree" ("user_id", "played") WHERE ("played" = false);



CREATE INDEX "idx_daily_summaries_user_date" ON "public"."daily_summaries" USING "btree" ("user_id", "date" DESC);



CREATE INDEX "idx_drift_events_drifting_sessions" ON "public"."drift_events" USING "btree" ("session_id", "is_drifting", "created_at" DESC) WHERE ("is_drifting" = true);



CREATE INDEX "idx_drift_events_false_detection" ON "public"."drift_events" USING "btree" ("session_id", "created_at" DESC) WHERE ("is_false_detection" = true);



CREATE INDEX "idx_drift_events_idle" ON "public"."drift_events" USING "btree" ("session_id", "created_at" DESC) WHERE ("is_idle" = true);



CREATE INDEX "idx_drift_events_intervention" ON "public"."drift_events" USING "btree" ("session_id", "intervention_triggered", "created_at" DESC) WHERE ("intervention_triggered" = false);



CREATE INDEX "idx_drift_events_screen_file" ON "public"."drift_events" USING "btree" ("session_id", "created_at" DESC) WHERE ("screen_file_id" IS NOT NULL);



CREATE INDEX "idx_drift_events_session_time" ON "public"."drift_events" USING "btree" ("session_id", "created_at" DESC);



CREATE INDEX "idx_drift_events_task_title" ON "public"."drift_events" USING "btree" ("detected_task_title", "created_at" DESC);



CREATE INDEX "idx_drift_events_user_id" ON "public"."drift_events" USING "btree" ("user_id");



CREATE INDEX "idx_false_detect_exceptions_created_at" ON "public"."false_detect_exceptions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_false_detect_exceptions_user_id" ON "public"."false_detect_exceptions" USING "btree" ("user_id");



CREATE INDEX "idx_onboarding_ip_hash" ON "public"."onboarding_session" USING "btree" ("ip_address_hash") WHERE ("ip_address_hash" IS NOT NULL);



CREATE INDEX "idx_onboarding_ip_hash_created" ON "public"."onboarding_session" USING "btree" ("ip_address_hash", "created_at" DESC) WHERE ("ip_address_hash" IS NOT NULL);



CREATE INDEX "idx_onboarding_session_created_at" ON "public"."onboarding_session" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_onboarding_session_device_id" ON "public"."onboarding_session" USING "btree" ("device_id");



CREATE INDEX "idx_onboarding_session_device_user" ON "public"."onboarding_session" USING "btree" ("device_id", "user_id");



CREATE INDEX "idx_onboarding_session_session_id" ON "public"."onboarding_session" USING "btree" ("session_id");



CREATE INDEX "idx_onboarding_session_status" ON "public"."onboarding_session" USING "btree" ("status");



CREATE INDEX "idx_onboarding_session_user_id" ON "public"."onboarding_session" USING "btree" ("user_id");



CREATE INDEX "idx_onboarding_session_visitor_id" ON "public"."onboarding_session" USING "btree" ("visitor_id") WHERE ("visitor_id" IS NOT NULL);



CREATE INDEX "idx_onboarding_session_visitor_status" ON "public"."onboarding_session" USING "btree" ("visitor_id", "status", "task_ended_at" DESC) WHERE ("visitor_id" IS NOT NULL);



CREATE INDEX "idx_phone_calls_recent" ON "public"."phone_calls" USING "btree" ("user_id", "initiated_at" DESC) WHERE ("status" = ANY (ARRAY['initiated'::"text", 'ringing'::"text", 'answered'::"text"]));



CREATE INDEX "idx_phone_calls_session" ON "public"."phone_calls" USING "btree" ("session_id");



CREATE INDEX "idx_phone_calls_status" ON "public"."phone_calls" USING "btree" ("status", "initiated_at" DESC);



CREATE INDEX "idx_phone_calls_user" ON "public"."phone_calls" USING "btree" ("user_id", "initiated_at" DESC);



CREATE INDEX "idx_routine_completions_date" ON "public"."routine_completions" USING "btree" ("completion_date");



CREATE INDEX "idx_routine_completions_task_id" ON "public"."routine_completions" USING "btree" ("task_id");



CREATE INDEX "idx_routine_completions_user_id" ON "public"."routine_completions" USING "btree" ("user_id");



CREATE INDEX "idx_routine_completions_user_task" ON "public"."routine_completions" USING "btree" ("user_id", "task_id");



CREATE INDEX "idx_session_events_session" ON "public"."session_events" USING "btree" ("session_id", "created_at");



CREATE INDEX "idx_session_events_type" ON "public"."session_events" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "idx_sessions_inactive" ON "public"."sailing_sessions" USING "btree" ("state", "last_activity_at") WHERE ("state" = 'active'::"public"."session_state");



CREATE INDEX "idx_sessions_user_active" ON "public"."sailing_sessions" USING "btree" ("user_id", "state") WHERE ("state" = 'active'::"public"."session_state");



CREATE INDEX "idx_sessions_user_date" ON "public"."sailing_sessions" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX "idx_tasks_category" ON "public"."tasks" USING "btree" ("category") WHERE ("category" IS NOT NULL);



CREATE INDEX "idx_tasks_due_date" ON "public"."tasks" USING "btree" ("due_date") WHERE ("status" <> 'completed'::"public"."task_status");



CREATE INDEX "idx_tasks_parent_routine" ON "public"."tasks" USING "btree" ("parent_routine_id");



CREATE INDEX "idx_tasks_push_retry" ON "public"."tasks" USING "btree" ("reminder_date", "time", "called", "push_attempts") WHERE (("called" = false) AND ("push_attempts" < 3));



CREATE INDEX "idx_tasks_type_date" ON "public"."tasks" USING "btree" ("task_type", "reminder_date");



CREATE INDEX "idx_tasks_user_category" ON "public"."tasks" USING "btree" ("user_id", "category");



CREATE INDEX "idx_tasks_user_completed" ON "public"."tasks" USING "btree" ("user_id", "status", "completed_at" DESC) WHERE ("status" = 'completed'::"public"."task_status");



CREATE INDEX "idx_tasks_user_mood" ON "public"."tasks" USING "btree" ("user_id", "completion_mood") WHERE ("completion_mood" IS NOT NULL);



CREATE INDEX "idx_tasks_user_order" ON "public"."tasks" USING "btree" ("user_id", "order_index") WHERE ("status" <> 'completed'::"public"."task_status");



CREATE INDEX "idx_tasks_user_priority" ON "public"."tasks" USING "btree" ("user_id", "priority");



CREATE INDEX "idx_tasks_user_status" ON "public"."tasks" USING "btree" ("user_id", "status");



CREATE UNIQUE INDEX "idx_unique_routine_instance" ON "public"."tasks" USING "btree" ("parent_routine_id", "reminder_date") WHERE (("task_type" = 'routine_instance'::"text") AND ("parent_routine_id" IS NOT NULL));



CREATE INDEX "idx_user_devices_platform" ON "public"."user_devices" USING "btree" ("platform");



CREATE INDEX "idx_user_devices_user_id" ON "public"."user_devices" USING "btree" ("user_id");



CREATE INDEX "idx_user_memories_content_search" ON "public"."user_memories" USING "gin" ("to_tsvector"('"english"'::"regconfig", "content"));



CREATE INDEX "idx_user_memories_created_at" ON "public"."user_memories" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_user_memories_effective" ON "public"."user_memories" USING "btree" ("user_id", "tag") WHERE ("tag" = 'EFFECTIVE'::"text");



CREATE INDEX "idx_user_memories_embedding" ON "public"."user_memories" USING "hnsw" ("embedding" "public"."vector_cosine_ops");



CREATE INDEX "idx_user_memories_tag" ON "public"."user_memories" USING "btree" ("tag");



CREATE INDEX "idx_user_memories_task_name" ON "public"."user_memories" USING "btree" ("task_name");



CREATE INDEX "idx_user_memories_user_id" ON "public"."user_memories" USING "btree" ("user_id");



CREATE INDEX "idx_user_memories_user_tag" ON "public"."user_memories" USING "btree" ("user_id", "tag");



CREATE UNIQUE INDEX "idx_users_active_session" ON "public"."sailing_sessions" USING "btree" ("user_id") WHERE ("state" = 'active'::"public"."session_state");



CREATE INDEX "idx_users_created_at" ON "public"."users" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_users_google_id" ON "public"."users" USING "btree" ("google_id");



CREATE INDEX "idx_users_last_seen" ON "public"."users" USING "btree" ("last_seen_at" DESC);



CREATE INDEX "idx_visitors_created_at" ON "public"."visitors" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_visitors_device_fingerprint" ON "public"."visitors" USING "btree" ("device_fingerprint") WHERE ("device_fingerprint" IS NOT NULL);



CREATE INDEX "idx_visitors_has_completed" ON "public"."visitors" USING "btree" ("has_completed_onboarding");



CREATE INDEX "idx_voice_thoughts_unprocessed" ON "public"."voice_thoughts" USING "btree" ("processed") WHERE ("processed" = false);



CREATE INDEX "idx_voice_thoughts_user" ON "public"."voice_thoughts" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "users_device_fingerprint_key" ON "public"."users" USING "btree" ("device_fingerprint") WHERE ("device_fingerprint" IS NOT NULL);



CREATE OR REPLACE VIEW "public"."active_sessions_view" AS
 SELECT "s"."id",
    "s"."user_id",
    "s"."state",
    "s"."started_at",
    "s"."ended_at",
    "s"."total_focus_seconds",
    "s"."total_drift_seconds",
    "s"."drift_count",
    "s"."summary",
    "s"."created_at",
    "s"."updated_at",
    "s"."last_activity_at",
    "u"."device_fingerprint",
    "u"."display_name",
    COALESCE("string_agg"(DISTINCT "t"."title", ', '::"text" ORDER BY "t"."title"), ''::"text") AS "task_titles"
   FROM ((("public"."sailing_sessions" "s"
     JOIN "public"."users" "u" ON (("s"."user_id" = "u"."id")))
     LEFT JOIN "public"."sailing_session_tasks" "sst" ON (("sst"."session_id" = "s"."id")))
     LEFT JOIN "public"."tasks" "t" ON (("t"."id" = "sst"."task_id")))
  WHERE ("s"."state" = 'active'::"public"."session_state")
  GROUP BY "s"."id", "s"."user_id", "s"."state", "s"."started_at", "s"."ended_at", "s"."total_focus_seconds", "s"."total_drift_seconds", "s"."drift_count", "s"."summary", "s"."created_at", "s"."updated_at", "u"."device_fingerprint", "u"."display_name";



CREATE OR REPLACE TRIGGER "task_insert_check" AFTER INSERT ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."check_task_on_insert"();



CREATE OR REPLACE TRIGGER "trigger_user_memories_updated_at" BEFORE UPDATE ON "public"."user_memories" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_memories_updated_at"();



CREATE OR REPLACE TRIGGER "update_onboarding_session_updated_at" BEFORE UPDATE ON "public"."onboarding_session" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_sessions_updated_at" BEFORE UPDATE ON "public"."sailing_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_tasks_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_drift_event_id_fkey" FOREIGN KEY ("drift_event_id") REFERENCES "public"."drift_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_phone_call_id_fkey" FOREIGN KEY ("phone_call_id") REFERENCES "public"."phone_calls"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sailing_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."animation_queue"
    ADD CONSTRAINT "animation_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_summaries"
    ADD CONSTRAINT "daily_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drift_events"
    ADD CONSTRAINT "drift_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sailing_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drift_events"
    ADD CONSTRAINT "drift_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."false_detect_exceptions"
    ADD CONSTRAINT "false_detect_exceptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interview_leads"
    ADD CONSTRAINT "interview_leads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."onboarding_session"
    ADD CONSTRAINT "onboarding_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_session"
    ADD CONSTRAINT "onboarding_session_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."phone_calls"
    ADD CONSTRAINT "phone_calls_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sailing_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."phone_calls"
    ADD CONSTRAINT "phone_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."routine_completions"
    ADD CONSTRAINT "routine_completions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."routine_completions"
    ADD CONSTRAINT "routine_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sailing_session_tasks"
    ADD CONSTRAINT "sailing_session_tasks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sailing_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sailing_session_tasks"
    ADD CONSTRAINT "sailing_session_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sailing_sessions"
    ADD CONSTRAINT "sailing_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_events"
    ADD CONSTRAINT "session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sailing_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_parent_routine_id_fkey" FOREIGN KEY ("parent_routine_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_version_requests"
    ADD CONSTRAINT "test_version_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_memories"
    ADD CONSTRAINT "user_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voice_thoughts"
    ADD CONSTRAINT "voice_thoughts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow anon insert" ON "public"."user_feedback" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon insert leads" ON "public"."interview_leads" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon select" ON "public"."user_feedback" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon update" ON "public"."user_feedback" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated insert" ON "public"."user_feedback" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated insert leads" ON "public"."interview_leads" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated select" ON "public"."user_feedback" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated update" ON "public"."user_feedback" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Anonymous users can manage drift events" ON "public"."drift_events" USING (true);



CREATE POLICY "Anonymous users can manage sessions" ON "public"."sailing_sessions" USING (true);



CREATE POLICY "Anonymous users can manage tasks" ON "public"."tasks" USING (true);



CREATE POLICY "Anonymous users can manage voice thoughts" ON "public"."voice_thoughts" USING (true);



CREATE POLICY "Anyone can check if email exists" ON "public"."test_version_requests" FOR SELECT USING (true);



CREATE POLICY "Anyone can insert test version requests" ON "public"."test_version_requests" FOR INSERT WITH CHECK (true);



CREATE POLICY "Policy with security definer functions" ON "public"."goal" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."SailingLog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Service role can insert memories" ON "public"."user_memories" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can manage drift events" ON "public"."drift_events" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage sessions" ON "public"."sailing_sessions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage tasks" ON "public"."tasks" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage voice thoughts" ON "public"."voice_thoughts" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can update memories" ON "public"."user_memories" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Users can delete own memories" ON "public"."user_memories" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own memories" ON "public"."user_memories" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own requests" ON "public"."test_version_requests" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."ai_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."animation_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "animation_queue_policy" ON "public"."animation_queue" USING (("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid"));



ALTER TABLE "public"."daily_summaries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_summaries_policy" ON "public"."daily_summaries" USING (("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid"));



CREATE POLICY "delete_own_session_tasks" ON "public"."sailing_session_tasks" FOR DELETE USING (("session_id" IN ( SELECT "sailing_sessions"."id"
   FROM "public"."sailing_sessions"
  WHERE ("sailing_sessions"."user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid"))));



ALTER TABLE "public"."drift_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_own_session_tasks" ON "public"."sailing_session_tasks" FOR INSERT WITH CHECK (("session_id" IN ( SELECT "sailing_sessions"."id"
   FROM "public"."sailing_sessions"
  WHERE ("sailing_sessions"."user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid"))));



ALTER TABLE "public"."interview_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retention_policy" ON "public"."session_events" FOR DELETE USING (("created_at" < ("now"() - '60 days'::interval)));



ALTER TABLE "public"."sailing_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_own_session_tasks" ON "public"."sailing_session_tasks" FOR SELECT USING (("session_id" IN ( SELECT "sailing_sessions"."id"
   FROM "public"."sailing_sessions"
  WHERE ("sailing_sessions"."user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid"))));



ALTER TABLE "public"."session_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_events_policy" ON "public"."session_events" USING (("session_id" IN ( SELECT "sailing_sessions"."id"
   FROM "public"."sailing_sessions"
  WHERE ("sailing_sessions"."user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid"))));



CREATE POLICY "sessions_policy" ON "public"."sailing_sessions" USING (("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid"));



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_policy" ON "public"."tasks" USING (("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid"));



ALTER TABLE "public"."test_version_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_memories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_delete_none" ON "public"."users" FOR DELETE USING (false);



CREATE POLICY "users_insert_own" ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "users_select_own" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."voice_thoughts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "voice_thoughts_policy" ON "public"."voice_thoughts" USING (("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid"));



CREATE POLICY "允许插入设备记录" ON "public"."user_devices" FOR INSERT WITH CHECK (true);



CREATE POLICY "允许更新设备记录" ON "public"."user_devices" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "用户可以删除自己的设备" ON "public"."user_devices" FOR DELETE USING ((("auth"."uid"())::"text" = ("user_id")::"text"));



CREATE POLICY "用户可以查看自己的设备" ON "public"."user_devices" FOR SELECT USING ((("auth"."uid"())::"text" = ("user_id")::"text"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "admin_user";



GRANT ALL ON FUNCTION "public"."calculate_user_streak"("p_user_id" "uuid", "p_task_keywords" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_user_streak"("p_user_id" "uuid", "p_task_keywords" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_user_streak"("p_user_id" "uuid", "p_task_keywords" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_and_send_task_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_send_task_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_send_task_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_recent_phone_call"("p_user_id" "uuid", "p_minutes_ago" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_recent_phone_call"("p_user_id" "uuid", "p_minutes_ago" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_recent_phone_call"("p_user_id" "uuid", "p_minutes_ago" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_task_on_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_task_on_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_task_on_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_old_heartbeat_images"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_old_heartbeat_images"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_old_heartbeat_images"() TO "service_role";



GRANT ALL ON FUNCTION "public"."end_sailing_session"("session_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."end_sailing_session"("session_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_sailing_session"("session_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_upcoming_routine_instances"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_upcoming_routine_instances"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_upcoming_routine_instances"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_daily_routine_instances"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_daily_routine_instances"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_daily_routine_instances"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_deep_drift_cron_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_deep_drift_cron_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_deep_drift_cron_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_google_user"("google_id_param" "text", "email_param" "text", "name_param" "text", "picture_url_param" "text", "ip_addr_param" "inet", "user_agent_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_google_user"("google_id_param" "text", "email_param" "text", "name_param" "text", "picture_url_param" "text", "ip_addr_param" "inet", "user_agent_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_google_user"("google_id_param" "text", "email_param" "text", "name_param" "text", "picture_url_param" "text", "ip_addr_param" "inet", "user_agent_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_user"("fingerprint" "text", "ip_addr" "inet", "user_agent_str" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_user"("fingerprint" "text", "ip_addr" "inet", "user_agent_str" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_user"("fingerprint" "text", "ip_addr" "inet", "user_agent_str" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_personal_best"("p_user_id" "uuid", "p_task_keywords" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_personal_best"("p_user_id" "uuid", "p_task_keywords" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_personal_best"("p_user_id" "uuid", "p_task_keywords" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_drift_monitor_responses"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_drift_monitor_responses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_drift_monitor_responses"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_session_stats"("session_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_session_stats"("session_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_session_stats"("session_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_by_jwt_token"("token_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_by_jwt_token"("token_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_by_jwt_token"("token_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_success_summary"("p_user_id" "uuid", "p_task_keywords" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_success_summary"("p_user_id" "uuid", "p_task_keywords" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_success_summary"("p_user_id" "uuid", "p_task_keywords" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_phone_call"("p_user_id" "uuid", "p_session_id" "uuid", "p_phone_number" "text", "p_room_name" "text", "p_conversation_id" "text", "p_context" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_phone_call"("p_user_id" "uuid", "p_session_id" "uuid", "p_phone_number" "text", "p_room_name" "text", "p_conversation_id" "text", "p_context" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_phone_call"("p_user_id" "uuid", "p_session_id" "uuid", "p_phone_number" "text", "p_room_name" "text", "p_conversation_id" "text", "p_context" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_task_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_task_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_task_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_similar_memories"("p_user_id" "uuid", "p_embedding" "text", "p_tag" "text", "p_threshold" double precision, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_similar_memories"("p_user_id" "uuid", "p_embedding" "text", "p_tag" "text", "p_threshold" double precision, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_similar_memories"("p_user_id" "uuid", "p_embedding" "text", "p_tag" "text", "p_threshold" double precision, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_similar_memories"("p_user_id" "uuid", "p_embedding" "public"."vector", "p_tag" "text", "p_threshold" double precision, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_similar_memories"("p_user_id" "uuid", "p_embedding" "public"."vector", "p_tag" "text", "p_threshold" double precision, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_similar_memories"("p_user_id" "uuid", "p_embedding" "public"."vector", "p_tag" "text", "p_threshold" double precision, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_config"("setting_name" "text", "setting_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_config"("setting_name" "text", "setting_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_config"("setting_name" "text", "setting_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_goal"("user_uuid" "uuid", "goal_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_goal"("user_uuid" "uuid", "goal_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_goal"("user_uuid" "uuid", "goal_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."start_sailing_session"("user_uuid" "uuid", "task_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."start_sailing_session"("user_uuid" "uuid", "task_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_sailing_session"("user_uuid" "uuid", "task_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."start_sailing_session_v2"("user_uuid" "uuid", "task_uuids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."start_sailing_session_v2"("user_uuid" "uuid", "task_uuids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_sailing_session_v2"("user_uuid" "uuid", "task_uuids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_memory_access"("p_memory_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."update_memory_access"("p_memory_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_memory_access"("p_memory_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_phone_call_status"("p_call_id" "uuid", "p_status" "text", "p_sip_call_id" "text", "p_sip_participant_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_phone_call_status"("p_call_id" "uuid", "p_status" "text", "p_sip_call_id" "text", "p_sip_participant_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_phone_call_status"("p_call_id" "uuid", "p_status" "text", "p_sip_call_id" "text", "p_sip_participant_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_reminders_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_reminders_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_reminders_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_session_activity"("session_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_session_activity"("session_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_session_activity"("session_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_memories_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_memories_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_memories_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_user_device"("p_user_id" "uuid", "p_device_token" "text", "p_device_type" "text", "p_platform" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_user_device"("p_user_id" "uuid", "p_device_token" "text", "p_device_type" "text", "p_platform" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_user_device"("p_user_id" "uuid", "p_device_token" "text", "p_device_type" "text", "p_platform" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_user_device_improved"("p_user_id" "uuid", "p_device_token" "text", "p_device_type" "text", "p_platform" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_user_device_improved"("p_user_id" "uuid", "p_device_token" "text", "p_device_type" "text", "p_platform" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_user_device_improved"("p_user_id" "uuid", "p_device_token" "text", "p_device_type" "text", "p_platform" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_jwt_token"("token_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_jwt_token"("token_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_jwt_token"("token_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_jwt_user"("jwt_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_jwt_user"("jwt_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_jwt_user"("jwt_token" "text") TO "service_role";



GRANT ALL ON TABLE "public"."SailingLog" TO "anon";
GRANT ALL ON TABLE "public"."SailingLog" TO "authenticated";
GRANT ALL ON TABLE "public"."SailingLog" TO "service_role";
GRANT ALL ON TABLE "public"."SailingLog" TO "admin_user";



GRANT ALL ON SEQUENCE "public"."SailingLog_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."SailingLog_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."SailingLog_id_seq" TO "service_role";
GRANT ALL ON SEQUENCE "public"."SailingLog_id_seq" TO "admin_user";



GRANT ALL ON TABLE "public"."active_sessions_view" TO "anon";
GRANT ALL ON TABLE "public"."active_sessions_view" TO "authenticated";
GRANT ALL ON TABLE "public"."active_sessions_view" TO "service_role";



GRANT ALL ON TABLE "public"."ai_conversations" TO "anon";
GRANT ALL ON TABLE "public"."ai_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_conversations" TO "service_role";
GRANT ALL ON TABLE "public"."ai_conversations" TO "admin_user";



GRANT ALL ON TABLE "public"."animation_queue" TO "anon";
GRANT ALL ON TABLE "public"."animation_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."animation_queue" TO "service_role";
GRANT ALL ON TABLE "public"."animation_queue" TO "admin_user";



GRANT ALL ON TABLE "public"."daily_summaries" TO "anon";
GRANT ALL ON TABLE "public"."daily_summaries" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_summaries" TO "service_role";
GRANT ALL ON TABLE "public"."daily_summaries" TO "admin_user";



GRANT ALL ON TABLE "public"."drift_events" TO "anon";
GRANT ALL ON TABLE "public"."drift_events" TO "authenticated";
GRANT ALL ON TABLE "public"."drift_events" TO "service_role";
GRANT ALL ON TABLE "public"."drift_events" TO "admin_user";



GRANT ALL ON TABLE "public"."false_detect_exceptions" TO "anon";
GRANT ALL ON TABLE "public"."false_detect_exceptions" TO "authenticated";
GRANT ALL ON TABLE "public"."false_detect_exceptions" TO "service_role";



GRANT ALL ON TABLE "public"."goal" TO "anon";
GRANT ALL ON TABLE "public"."goal" TO "authenticated";
GRANT ALL ON TABLE "public"."goal" TO "service_role";
GRANT ALL ON TABLE "public"."goal" TO "admin_user";



GRANT ALL ON TABLE "public"."interview_leads" TO "anon";
GRANT ALL ON TABLE "public"."interview_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."interview_leads" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_session" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_session" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_session" TO "service_role";



GRANT ALL ON TABLE "public"."phone_calls" TO "anon";
GRANT ALL ON TABLE "public"."phone_calls" TO "authenticated";
GRANT ALL ON TABLE "public"."phone_calls" TO "service_role";
GRANT ALL ON TABLE "public"."phone_calls" TO "admin_user";



GRANT ALL ON TABLE "public"."routine_completions" TO "anon";
GRANT ALL ON TABLE "public"."routine_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."routine_completions" TO "service_role";



GRANT ALL ON TABLE "public"."sailing_session_tasks" TO "anon";
GRANT ALL ON TABLE "public"."sailing_session_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."sailing_session_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."sailing_sessions" TO "anon";
GRANT ALL ON TABLE "public"."sailing_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sailing_sessions" TO "service_role";
GRANT ALL ON TABLE "public"."sailing_sessions" TO "admin_user";



GRANT ALL ON TABLE "public"."schema_versions" TO "anon";
GRANT ALL ON TABLE "public"."schema_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."schema_versions" TO "service_role";
GRANT ALL ON TABLE "public"."schema_versions" TO "admin_user";



GRANT ALL ON TABLE "public"."session_events" TO "anon";
GRANT ALL ON TABLE "public"."session_events" TO "authenticated";
GRANT ALL ON TABLE "public"."session_events" TO "service_role";
GRANT ALL ON TABLE "public"."session_events" TO "admin_user";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";
GRANT ALL ON TABLE "public"."tasks" TO "admin_user";



GRANT ALL ON TABLE "public"."test_version_requests" TO "anon";
GRANT ALL ON TABLE "public"."test_version_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."test_version_requests" TO "service_role";



GRANT ALL ON TABLE "public"."user_devices" TO "anon";
GRANT ALL ON TABLE "public"."user_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."user_devices" TO "service_role";



GRANT ALL ON TABLE "public"."user_feedback" TO "anon";
GRANT ALL ON TABLE "public"."user_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."user_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."user_memories" TO "anon";
GRANT ALL ON TABLE "public"."user_memories" TO "authenticated";
GRANT ALL ON TABLE "public"."user_memories" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";
GRANT ALL ON TABLE "public"."users" TO "admin_user";



GRANT ALL ON TABLE "public"."visitors" TO "anon";
GRANT ALL ON TABLE "public"."visitors" TO "authenticated";
GRANT ALL ON TABLE "public"."visitors" TO "service_role";



GRANT ALL ON TABLE "public"."voice_thoughts" TO "anon";
GRANT ALL ON TABLE "public"."voice_thoughts" TO "authenticated";
GRANT ALL ON TABLE "public"."voice_thoughts" TO "service_role";
GRANT ALL ON TABLE "public"."voice_thoughts" TO "admin_user";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






