-- ============================================================================
-- 测试数据：动态目标调整
--
-- 使用方法：
--   1. 连接到本地 Supabase: psql postgresql://postgres:postgres@localhost:54322/postgres
--   2. 运行此脚本: \i scripts/test-goal-adjustment-data.sql
--
-- 或者直接使用 docker exec:
--   docker exec supabase_db_firego-local psql -U postgres -d postgres -f /path/to/this/file
-- ============================================================================

DO $$
DECLARE
  test_user_id UUID;
  test_goal_id UUID;
  yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
BEGIN
  -- 尝试获取一个已存在的用户
  SELECT id INTO test_user_id FROM public.users LIMIT 1;

  IF test_user_id IS NULL THEN
    RAISE NOTICE '没有找到用户，请先创建用户';
    RETURN;
  END IF;

  RAISE NOTICE '使用用户: %', test_user_id;

  -- 删除旧的测试数据
  DELETE FROM public.goal_entries WHERE goal_id IN (
    SELECT id FROM public.goals WHERE user_id = test_user_id AND name LIKE '测试%'
  );
  DELETE FROM public.goal_adjustment_history WHERE goal_id IN (
    SELECT id FROM public.goals WHERE user_id = test_user_id AND name LIKE '测试%'
  );
  DELETE FROM public.goals WHERE user_id = test_user_id AND name LIKE '测试%';

  RAISE NOTICE '已清理旧测试数据';

  -- ========================================================================
  -- 场景 1: 连续失败 2 天，应该触发回退
  -- ========================================================================
  INSERT INTO public.goals (
    user_id, goal_type, name, description,
    ultimate_target_time, current_target_time, baseline_time,
    target_duration_minutes, adjustment_step_minutes,
    consecutive_success, consecutive_failure,
    success_threshold, failure_threshold,
    is_active
  ) VALUES (
    test_user_id, 'sleep', '测试-早睡(应回退)', '测试连续失败场景',
    '23:00', '00:00', '02:00',
    480, 15,
    0, 1,  -- 已经失败 1 天，昨天再失败就触发
    3, 2,
    true
  ) RETURNING id INTO test_goal_id;

  -- 添加昨天的失败记录
  INSERT INTO public.goal_entries (
    goal_id, user_id, entry_date,
    target_time, actual_time,
    completed, completion_source, prediction_error_minutes
  ) VALUES (
    test_goal_id, test_user_id, yesterday,
    '00:00', '02:30',
    false, 'self_report', 150  -- 晚了 2.5 小时
  );

  RAISE NOTICE '场景1: 创建了连续失败场景 (goal_id: %)', test_goal_id;

  -- ========================================================================
  -- 场景 2: 连续成功 3 天，应该触发提前
  -- ========================================================================
  INSERT INTO public.goals (
    user_id, goal_type, name, description,
    ultimate_target_time, current_target_time, baseline_time,
    target_duration_minutes, adjustment_step_minutes,
    consecutive_success, consecutive_failure,
    success_threshold, failure_threshold,
    is_active
  ) VALUES (
    test_user_id, 'sleep', '测试-早睡(应提前)', '测试连续成功场景',
    '23:00', '01:00', '03:00',
    480, 15,
    2, 0,  -- 已经成功 2 天，昨天再成功就触发
    3, 2,
    true
  ) RETURNING id INTO test_goal_id;

  -- 添加昨天的成功记录
  INSERT INTO public.goal_entries (
    goal_id, user_id, entry_date,
    target_time, actual_time,
    completed, completion_source, prediction_error_minutes
  ) VALUES (
    test_goal_id, test_user_id, yesterday,
    '01:00', '00:50',
    true, 'self_report', -10  -- 比目标早 10 分钟
  );

  RAISE NOTICE '场景2: 创建了连续成功场景 (goal_id: %)', test_goal_id;

  -- ========================================================================
  -- 场景 3: 正常情况，不应该调整
  -- ========================================================================
  INSERT INTO public.goals (
    user_id, goal_type, name, description,
    ultimate_target_time, current_target_time, baseline_time,
    target_duration_minutes, adjustment_step_minutes,
    consecutive_success, consecutive_failure,
    success_threshold, failure_threshold,
    is_active
  ) VALUES (
    test_user_id, 'sleep', '测试-早睡(不调整)', '测试正常场景',
    '23:00', '00:30', '02:00',
    480, 15,
    1, 0,  -- 成功 1 天，还没达到阈值
    3, 2,
    true
  ) RETURNING id INTO test_goal_id;

  -- 添加昨天的成功记录
  INSERT INTO public.goal_entries (
    goal_id, user_id, entry_date,
    target_time, actual_time,
    completed, completion_source, prediction_error_minutes
  ) VALUES (
    test_goal_id, test_user_id, yesterday,
    '00:30', '00:25',
    true, 'self_report', -5
  );

  RAISE NOTICE '场景3: 创建了正常场景 (goal_id: %)', test_goal_id;

  RAISE NOTICE '';
  RAISE NOTICE '测试数据创建完成！';
  RAISE NOTICE '';
  RAISE NOTICE '预期结果：';
  RAISE NOTICE '  - 测试-早睡(应回退): 00:00 -> 00:15 (回退 15 分钟)';
  RAISE NOTICE '  - 测试-早睡(应提前): 01:00 -> 00:45 (提前 15 分钟)';
  RAISE NOTICE '  - 测试-早睡(不调整): 00:30 -> 00:30 (不变)';

END $$;

-- 查看创建的数据
SELECT
  g.name,
  g.current_target_time,
  g.consecutive_success,
  g.consecutive_failure,
  e.entry_date,
  e.completed
FROM public.goals g
LEFT JOIN public.goal_entries e ON g.id = e.goal_id
WHERE g.name LIKE '测试%'
ORDER BY g.name;
