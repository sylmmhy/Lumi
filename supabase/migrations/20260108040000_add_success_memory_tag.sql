-- ============================================================================
-- 记忆系统升级：新增 SUCCESS 标签
--
-- 目的：让 AI 能够记住用户的成功经历，用于正向激励
-- 例如："你上次健身坚持了 5 分钟，这次也可以！"
-- ============================================================================

-- ============================================================================
-- 第 1 步：修改 tag 字段的 CHECK 约束，添加 SUCCESS
-- ============================================================================

-- 删除旧的 CHECK 约束
-- 注意：约束名可能是自动生成的，需要先查找
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- 查找 tag 字段的 CHECK 约束名
  SELECT conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'user_memories'::regclass
    AND a.attname = 'tag'
    AND c.contype = 'c';

  -- 如果找到约束，删除它
  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE user_memories DROP CONSTRAINT ' || constraint_name;
    RAISE NOTICE '已删除旧的 tag 约束: %', constraint_name;
  END IF;
END $$;

-- 添加新的 CHECK 约束，包含 SUCCESS
ALTER TABLE user_memories
  ADD CONSTRAINT user_memories_tag_check
  CHECK (tag IN ('PREF', 'PROC', 'SOMA', 'EMO', 'SAB', 'SUCCESS'));

-- ============================================================================
-- 第 2 步：为 SUCCESS 类型创建专用索引
-- ============================================================================

-- SUCCESS 记忆的专用索引（按时间倒序，用于获取最近的成功记录）
CREATE INDEX IF NOT EXISTS idx_user_memories_success
  ON user_memories(user_id, created_at DESC)
  WHERE tag = 'SUCCESS';

-- 任务类型索引（用于按任务类型查询成功记录）
CREATE INDEX IF NOT EXISTS idx_user_memories_task_type
  ON user_memories(user_id, (metadata->>'task_type'))
  WHERE tag = 'SUCCESS';

-- ============================================================================
-- 第 3 步：创建获取用户成功记录的函数
-- ============================================================================

/**
 * 获取用户的成功记录
 *
 * @param p_user_id   用户 ID
 * @param p_task_type 任务类型（可选，如 'workout', 'brush_teeth' 等）
 * @param p_limit     返回数量限制
 *
 * @returns 成功记录列表，包含时长、日期、连胜等信息
 *
 * 使用示例：
 *   SELECT * FROM get_user_success_records('user-uuid', 'workout', 5);
 */
CREATE OR REPLACE FUNCTION get_user_success_records(
  p_user_id UUID,
  p_task_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  task_name TEXT,
  task_type TEXT,
  duration_minutes INTEGER,
  completion_date DATE,
  streak_count INTEGER,
  overcame_resistance BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.task_name,
    (m.metadata->>'task_type')::TEXT,
    (m.metadata->>'duration_minutes')::INTEGER,
    (m.metadata->>'completion_date')::DATE,
    (m.metadata->>'streak_count')::INTEGER,
    (m.metadata->>'overcame_resistance')::BOOLEAN,
    m.created_at
  FROM user_memories m
  WHERE m.user_id = p_user_id
    AND m.tag = 'SUCCESS'
    AND (p_task_type IS NULL OR m.metadata->>'task_type' = p_task_type)
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 第 4 步：创建计算连胜天数的函数
-- ============================================================================

/**
 * 计算用户在某个任务类型上的连胜天数
 *
 * @param p_user_id   用户 ID
 * @param p_task_type 任务类型
 *
 * @returns 连续完成的天数（从今天往前数）
 *
 * 逻辑说明：
 *   - 从最近的完成日期开始
 *   - 检查是否连续（日期差为 1）
 *   - 遇到断档就停止计数
 *
 * 使用示例：
 *   SELECT calculate_user_streak('user-uuid', 'workout');
 *   -- 返回：3（表示连续 3 天完成）
 */
CREATE OR REPLACE FUNCTION calculate_user_streak(
  p_user_id UUID,
  p_task_type TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_streak INTEGER := 0;
  v_last_date DATE;
  v_current_date DATE;
  v_record RECORD;
BEGIN
  -- 获取今天的日期
  v_current_date := CURRENT_DATE;

  -- 遍历用户的成功记录（按日期倒序）
  FOR v_record IN
    SELECT DISTINCT (metadata->>'completion_date')::DATE as completion_date
    FROM user_memories
    WHERE user_id = p_user_id
      AND tag = 'SUCCESS'
      AND metadata->>'task_type' = p_task_type
      AND metadata->>'completion_date' IS NOT NULL
    ORDER BY completion_date DESC
  LOOP
    IF v_last_date IS NULL THEN
      -- 第一条记录
      -- 检查是否是今天或昨天（允许今天还没做的情况）
      IF v_current_date - v_record.completion_date <= 1 THEN
        v_streak := 1;
        v_last_date := v_record.completion_date;
      ELSE
        -- 最近的记录超过 1 天前，连胜为 0
        EXIT;
      END IF;
    ELSIF v_last_date - v_record.completion_date = 1 THEN
      -- 连续的一天
      v_streak := v_streak + 1;
      v_last_date := v_record.completion_date;
    ELSE
      -- 断档了，停止计数
      EXIT;
    END IF;
  END LOOP;

  RETURN v_streak;
END;
$$;

-- ============================================================================
-- 第 5 步：创建获取用户任务统计的函数
-- ============================================================================

/**
 * 获取用户在某个任务类型上的统计信息
 *
 * @param p_user_id   用户 ID
 * @param p_task_type 任务类型
 *
 * @returns 统计信息（总完成次数、平均时长、最长时长、当前连胜）
 *
 * 使用示例：
 *   SELECT * FROM get_user_task_stats('user-uuid', 'workout');
 */
CREATE OR REPLACE FUNCTION get_user_task_stats(
  p_user_id UUID,
  p_task_type TEXT
)
RETURNS TABLE (
  total_completions INTEGER,
  avg_duration_minutes NUMERIC,
  max_duration_minutes INTEGER,
  current_streak INTEGER,
  last_completion_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_completions,
    ROUND(AVG((metadata->>'duration_minutes')::INTEGER), 1) as avg_duration_minutes,
    MAX((metadata->>'duration_minutes')::INTEGER) as max_duration_minutes,
    calculate_user_streak(p_user_id, p_task_type) as current_streak,
    MAX((metadata->>'completion_date')::DATE) as last_completion_date
  FROM user_memories
  WHERE user_id = p_user_id
    AND tag = 'SUCCESS'
    AND metadata->>'task_type' = p_task_type;
END;
$$;

-- ============================================================================
-- 第 6 步：更新注释
-- ============================================================================

COMMENT ON COLUMN user_memories.tag IS
  'PREF=AI交互偏好, PROC=拖延原因, SOMA=身心模式, EMO=情绪触发, SAB=自我破坏, SUCCESS=成功记录';

COMMENT ON FUNCTION get_user_success_records IS
  '获取用户的成功完成记录，用于正向激励。可按任务类型过滤。';

COMMENT ON FUNCTION calculate_user_streak IS
  '计算用户在某个任务类型上的连胜天数。从今天往前数连续完成的天数。';

COMMENT ON FUNCTION get_user_task_stats IS
  '获取用户在某个任务类型上的统计信息，包括总次数、平均时长、最长时长、当前连胜。';

-- ============================================================================
-- 完成提示
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ SUCCESS 标签迁移完成！';
  RAISE NOTICE '   - tag 约束已更新，支持 SUCCESS';
  RAISE NOTICE '   - 已创建 SUCCESS 专用索引';
  RAISE NOTICE '   - 已创建 get_user_success_records() 函数';
  RAISE NOTICE '   - 已创建 calculate_user_streak() 函数';
  RAISE NOTICE '   - 已创建 get_user_task_stats() 函数';
END $$;
