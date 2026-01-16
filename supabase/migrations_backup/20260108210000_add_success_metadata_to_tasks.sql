-- ============================================================================
-- 迁移：为 tasks 表添加成功元数据字段
-- 目的：记录任务完成时的情绪、难度感知等信息，用于正向记忆激励系统
-- ============================================================================

-- 1. 添加成功元数据字段到 tasks 表
DO $$
BEGIN
  -- completion_mood: 任务完成时的情绪
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'completion_mood') THEN
    ALTER TABLE tasks ADD COLUMN completion_mood TEXT;
    ALTER TABLE tasks ADD CONSTRAINT tasks_completion_mood_check
      CHECK (completion_mood IS NULL OR completion_mood = ANY (ARRAY['proud', 'relieved', 'satisfied', 'neutral']));
  END IF;

  -- difficulty_perception: 难度感知
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'difficulty_perception') THEN
    ALTER TABLE tasks ADD COLUMN difficulty_perception TEXT;
    ALTER TABLE tasks ADD CONSTRAINT tasks_difficulty_perception_check
      CHECK (difficulty_perception IS NULL OR difficulty_perception = ANY (ARRAY['easier_than_usual', 'normal', 'harder_than_usual']));
  END IF;

  -- overcame_resistance: 是否克服了阻力
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'overcame_resistance') THEN
    ALTER TABLE tasks ADD COLUMN overcame_resistance BOOLEAN DEFAULT FALSE;
  END IF;

  -- actual_duration_minutes: 实际完成时长
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'actual_duration_minutes') THEN
    ALTER TABLE tasks ADD COLUMN actual_duration_minutes INTEGER;
  END IF;

  -- personal_best_at_completion: 完成时的个人最佳记录
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'personal_best_at_completion') THEN
    ALTER TABLE tasks ADD COLUMN personal_best_at_completion INTEGER;
  END IF;
END $$;

-- 添加注释
COMMENT ON COLUMN tasks.completion_mood IS '任务完成时的情绪: proud=骄傲, relieved=如释重负, satisfied=满足, neutral=一般';
COMMENT ON COLUMN tasks.difficulty_perception IS '难度感知: easier_than_usual=比平时简单, normal=正常, harder_than_usual=比平时难';
COMMENT ON COLUMN tasks.overcame_resistance IS '是否克服了阻力（一开始不想做但最终完成了）';
COMMENT ON COLUMN tasks.actual_duration_minutes IS '实际完成时长（分钟）';
COMMENT ON COLUMN tasks.personal_best_at_completion IS '完成时的个人最佳记录（分钟），用于判断是否创造新纪录';

-- 2. 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_tasks_user_completed
ON tasks (user_id, status, completed_at DESC)
WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_tasks_user_mood
ON tasks (user_id, completion_mood)
WHERE completion_mood IS NOT NULL;

-- 3. 创建函数：获取用户某任务类型的个人最佳记录
CREATE OR REPLACE FUNCTION get_personal_best(
  p_user_id UUID,
  p_task_keywords TEXT[]
)
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_personal_best(UUID, TEXT[]) IS '获取用户某任务类型的个人最佳时长记录';

-- 4. 创建函数：计算用户连胜天数
CREATE OR REPLACE FUNCTION calculate_user_streak(
  p_user_id UUID,
  p_task_keywords TEXT[]
)
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_user_streak(UUID, TEXT[]) IS '计算用户某任务类型的连续完成天数';

-- 5. 创建函数：获取用户成功记录摘要
CREATE OR REPLACE FUNCTION get_user_success_summary(
  p_user_id UUID,
  p_task_keywords TEXT[]
)
RETURNS TABLE (
  total_completions INTEGER,
  current_streak INTEGER,
  personal_best INTEGER,
  last_completion_date DATE,
  has_overcome_resistance BOOLEAN,
  has_proud_moment BOOLEAN
) AS $$
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
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_success_summary(UUID, TEXT[]) IS '获取用户成功记录摘要';
