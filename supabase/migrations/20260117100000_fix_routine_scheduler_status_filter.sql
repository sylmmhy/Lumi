-- =============================================
-- Bug 修复：routine 调度器应过滤已完成的 routine
-- =============================================
-- 问题：用户标记 routine 为 completed 后，pg_cron 仍然为其生成 routine_instance
--      导致用户收到"幽灵提醒"（前端不显示但后端仍发送推送）
-- 修复：在 generate_daily_routine_instances 中添加 status = 'pending' 过滤条件

-- 重新创建存储过程，添加 status 过滤
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
  -- 🔧 修复：只选择有 pending 状态 routine 的用户
  FOR v_user IN
    SELECT DISTINCT t.user_id
    FROM tasks t
    WHERE t.task_type = 'routine'
      AND t.is_recurring = true
      AND t.status = 'pending'  -- 🆕 只处理 pending 状态的 routine
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
    -- 🔧 修复：只处理 pending 状态的 routine，排除 completed/archived
    FOR v_template IN
      SELECT * FROM tasks t
      WHERE t.user_id = v_user.user_id
        AND t.task_type = 'routine'
        AND t.is_recurring = true
        AND t.status = 'pending'  -- 🆕 关键修复：只为 pending 的 routine 生成实例
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

-- 添加注释说明修复内容
COMMENT ON FUNCTION generate_daily_routine_instances IS
  'P0 修复：每日凌晨由 pg_cron 调用，为所有用户生成 routine_instance。
   2026-01-17 修复：添加 status=pending 过滤，不再为已完成/归档的 routine 生成实例。';
