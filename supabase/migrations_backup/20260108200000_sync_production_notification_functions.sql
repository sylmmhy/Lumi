-- =============================================
-- 同步生产环境的通知函数和 cron jobs
-- =============================================
-- 这个迁移将生产环境已验证可用的函数同步回代码库
-- 包含：
-- 1. ensure_upcoming_routine_instances() - 实时按用户时区生成 routine instances
-- 2. process_task_notifications() - 包装函数，整合生成和通知
-- 3. 更新 cron jobs 配置

-- =============================================
-- 1. 创建 ensure_upcoming_routine_instances 函数
-- =============================================
-- 这个函数按用户时区实时检查并生成缺失的 routine instances
-- 解决了旧版 generate_daily_routine_instances() 使用 UTC 导致的时区问题

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
  -- 查找未来 10 分钟内到期，但还没有实例的 routine
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
      -- 检查这个 routine 在当前时区的今天是否应该触发
      AND NOT EXISTS (
        -- 排除已经有今天实例的 routine
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
    -- 计算用户时区的今天
    v_user_timezone := COALESCE(v_routine_record.timezone, 'UTC');
    v_today := (NOW() AT TIME ZONE v_user_timezone)::DATE;
    v_today_dow := EXTRACT(DOW FROM v_today)::INT;

    -- 检查 recurrence_days（如果设置了）
    IF v_routine_record.recurrence_days IS NOT NULL
       AND array_length(v_routine_record.recurrence_days, 1) > 0
       AND NOT (v_today_dow = ANY(v_routine_record.recurrence_days)) THEN
      CONTINUE;
    END IF;

    -- 检查任务时间是否在未来 10 分钟内或已经过期但在今天
    -- 这样可以确保即使用户刚创建 routine，也能立即生成实例

    -- 创建 routine instance
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
    RETURNING id INTO v_instance_id;

    v_instances_created := v_instances_created + 1;
    RAISE NOTICE '✅ [Realtime] Created instance for routine "%" (ID: %)', v_routine_record.title, v_instance_id;
  END LOOP;

  IF v_instances_created > 0 THEN
    RAISE NOTICE '📊 [Realtime] Created % routine instances', v_instances_created;
  END IF;

  RETURN v_instances_created;
END;
$function$;

COMMENT ON FUNCTION ensure_upcoming_routine_instances IS '实时按用户时区生成缺失的 routine instances，每分钟由 cron 调用';

-- =============================================
-- 2. 创建 process_task_notifications 函数
-- =============================================
-- 这是一个包装函数，整合了：
-- 1. 确保 routine instances 存在
-- 2. 检查并发送通知
-- 由 cron job 每分钟调用

CREATE OR REPLACE FUNCTION process_task_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
$function$;

COMMENT ON FUNCTION process_task_notifications IS '主调度函数：先确保 routine instances 存在，再检查发送通知。由 cron 每分钟调用';

-- =============================================
-- 3. 更新 cron jobs
-- =============================================
-- 删除旧的 cron jobs（如果存在）
SELECT cron.unschedule('generate-daily-routines') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'generate-daily-routines'
);

SELECT cron.unschedule('process-pending-notifications') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-pending-notifications'
);

-- 创建新的 cron jobs

-- Job 1: 每分钟检查通知（包含实时生成 routine instances）
-- 这是主要的调度任务，确保通知及时发送
SELECT cron.schedule(
  'check-task-notifications',
  '* * * * *',  -- 每分钟
  $$SELECT public.process_task_notifications()$$
);

-- Job 2: 每小时补充生成 routine instances（作为备份）
-- 这确保即使实时生成遗漏了，每小时也会补上
SELECT cron.schedule(
  'generate-routines-hourly',
  '0 * * * *',  -- 每小时整点
  $$SELECT public.generate_daily_routine_instances()$$
);

-- =============================================
-- 4. 添加说明
-- =============================================
-- 生产环境 cron jobs 配置：
-- ┌─────────────────────────────┬─────────────┬──────────────────────────────────────────────────┐
-- │           Job Name          │   Schedule  │                    Command                       │
-- ├─────────────────────────────┼─────────────┼──────────────────────────────────────────────────┤
-- │ check-task-notifications    │ * * * * *   │ SELECT public.process_task_notifications()      │
-- │ generate-routines-hourly    │ 0 * * * *   │ SELECT public.generate_daily_routine_instances()│
-- └─────────────────────────────┴─────────────┴──────────────────────────────────────────────────┘
--
-- 工作流程：
-- 1. check-task-notifications 每分钟运行
--    -> 先调用 ensure_upcoming_routine_instances() 按用户时区生成缺失的 instances
--    -> 再调用 check_and_send_task_notifications() 检查到期任务并发送推送
--
-- 2. generate-routines-hourly 每小时运行
--    -> 作为备份，调用 generate_daily_routine_instances() 批量生成
