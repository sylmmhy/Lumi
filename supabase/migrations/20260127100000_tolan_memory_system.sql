-- =====================================================
-- Tolan 级别记忆系统升级
-- 功能：Multi-Query RAG + MRR 融合 + 夜间压缩
-- 日期：2026-01-27
-- =====================================================

-- 1. 扩展 user_memories 表
-- -----------------------

-- 重要性评分（0-1），用于确定记忆优先级和压缩策略
ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS importance_score FLOAT DEFAULT 0.5;

-- 记忆版本号，用于追踪更新
ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- 如果记忆被新记忆替代，记录替代者 ID
ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES user_memories(id);

-- 压缩状态：active=活跃, compressed=已压缩(软删除), deleted=已删除
ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS compression_status TEXT DEFAULT 'active';

-- 添加压缩状态约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_memories_compression_status_check'
  ) THEN
    ALTER TABLE user_memories
      ADD CONSTRAINT user_memories_compression_status_check
      CHECK (compression_status IN ('active', 'compressed', 'deleted'));
  END IF;
END $$;

-- 添加重要性评分约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_memories_importance_score_check'
  ) THEN
    ALTER TABLE user_memories
      ADD CONSTRAINT user_memories_importance_score_check
      CHECK (importance_score >= 0 AND importance_score <= 1);
  END IF;
END $$;

-- 2. 新增索引
-- -----------

-- 按重要性排序的索引，仅包含活跃记忆
CREATE INDEX IF NOT EXISTS idx_user_memories_importance
  ON user_memories(user_id, importance_score DESC)
  WHERE compression_status = 'active';

-- 压缩候选索引，用于夜间清理任务
CREATE INDEX IF NOT EXISTS idx_user_memories_compression
  ON user_memories(compression_status, updated_at)
  WHERE compression_status = 'active';

-- 添加字段注释
COMMENT ON COLUMN user_memories.importance_score IS '记忆重要性评分 0-1，用于 RAG 排序和压缩决策';
COMMENT ON COLUMN user_memories.version IS '记忆版本号，每次更新递增';
COMMENT ON COLUMN user_memories.superseded_by IS '被替代时，指向新记忆的 ID';
COMMENT ON COLUMN user_memories.compression_status IS '压缩状态：active=活跃, compressed=软删除, deleted=已删除';


-- 3. Multi-Query 向量搜索 RPC
-- ---------------------------
-- 接收多个 embedding，并行搜索，返回带排名的结果

CREATE OR REPLACE FUNCTION multi_query_search_memories(
  p_user_id UUID,
  p_embeddings TEXT[],  -- JSON 字符串数组，每个是一个 embedding 向量
  p_threshold FLOAT DEFAULT 0.6,
  p_limit_per_query INTEGER DEFAULT 5
)
RETURNS TABLE (
  query_index INTEGER,
  memory_id UUID,
  content TEXT,
  tag TEXT,
  confidence FLOAT,
  importance_score FLOAT,
  similarity FLOAT,
  rank INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_embedding vector(1536);
  v_query_idx INTEGER;
  v_embedding_text TEXT;
BEGIN
  -- 遍历每个 embedding
  FOR v_query_idx IN 1..array_length(p_embeddings, 1) LOOP
    v_embedding_text := p_embeddings[v_query_idx];

    -- 尝试转换为向量
    BEGIN
      v_embedding := v_embedding_text::vector(1536);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to parse embedding at index %: %', v_query_idx, SQLERRM;
      CONTINUE;
    END;

    -- 搜索相似记忆并返回结果
    RETURN QUERY
    WITH ranked_memories AS (
      SELECT
        m.id AS memory_id,
        m.content,
        m.tag,
        m.confidence::FLOAT,
        COALESCE(m.importance_score, 0.5)::FLOAT AS importance_score,
        (1 - (m.embedding <=> v_embedding))::FLOAT AS similarity,
        ROW_NUMBER() OVER (ORDER BY 1 - (m.embedding <=> v_embedding) DESC) AS rank
      FROM user_memories m
      WHERE m.user_id = p_user_id
        AND m.embedding IS NOT NULL
        AND COALESCE(m.compression_status, 'active') = 'active'
        AND (1 - (m.embedding <=> v_embedding)) >= p_threshold
      ORDER BY similarity DESC
      LIMIT p_limit_per_query
    )
    SELECT
      v_query_idx AS query_index,
      rm.memory_id,
      rm.content,
      rm.tag,
      rm.confidence,
      rm.importance_score,
      rm.similarity,
      rm.rank::INTEGER
    FROM ranked_memories rm;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION multi_query_search_memories IS 'Multi-Query RAG 向量搜索：接收多个 embedding 并行搜索，返回带排名的结果用于 MRR 融合';


-- 4. 获取压缩候选 RPC
-- -------------------
-- 用于夜间压缩任务，获取低价值或过期的记忆

CREATE OR REPLACE FUNCTION get_compression_candidates(
  p_user_id UUID DEFAULT NULL,  -- NULL 表示所有用户
  p_min_age_days INTEGER DEFAULT 7,
  p_low_importance_threshold FLOAT DEFAULT 0.3,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  memory_id UUID,
  user_id UUID,
  content TEXT,
  tag TEXT,
  importance_score FLOAT,
  confidence FLOAT,
  access_count INTEGER,
  days_since_update INTEGER,
  days_since_access INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id AS memory_id,
    m.user_id,
    m.content,
    m.tag,
    COALESCE(m.importance_score, 0.5)::FLOAT AS importance_score,
    m.confidence::FLOAT,
    COALESCE(m.access_count, 0) AS access_count,
    EXTRACT(DAY FROM NOW() - m.updated_at)::INTEGER AS days_since_update,
    COALESCE(EXTRACT(DAY FROM NOW() - m.last_accessed_at)::INTEGER, 999) AS days_since_access
  FROM user_memories m
  WHERE COALESCE(m.compression_status, 'active') = 'active'
    AND (p_user_id IS NULL OR m.user_id = p_user_id)
    AND (
      -- 条件1：低重要性 + 老记忆
      (
        COALESCE(m.importance_score, 0.5) < p_low_importance_threshold
        AND m.updated_at < NOW() - (p_min_age_days || ' days')::INTERVAL
      )
      OR
      -- 条件2：长时间未访问（超过 30 天）
      (
        m.last_accessed_at IS NOT NULL
        AND m.last_accessed_at < NOW() - INTERVAL '30 days'
        AND COALESCE(m.importance_score, 0.5) < 0.5
      )
      OR
      -- 条件3：低置信度 + 从未访问
      (
        m.confidence < 0.4
        AND m.last_accessed_at IS NULL
        AND m.updated_at < NOW() - (p_min_age_days || ' days')::INTERVAL
      )
    )
  ORDER BY
    COALESCE(m.importance_score, 0.5) ASC,
    m.updated_at ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_compression_candidates IS '获取待压缩的低价值记忆候选，用于夜间清理任务';


-- 5. 批量标记压缩 RPC
-- -------------------
-- 将记忆标记为已压缩或已删除

CREATE OR REPLACE FUNCTION mark_memories_compressed(
  p_memory_ids UUID[],
  p_action TEXT DEFAULT 'compress'  -- 'compress' 或 'delete'
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_status TEXT;
  v_affected INTEGER;
BEGIN
  -- 确定新状态
  IF p_action = 'delete' THEN
    v_new_status := 'deleted';
  ELSE
    v_new_status := 'compressed';
  END IF;

  -- 更新记忆状态
  UPDATE user_memories
  SET
    compression_status = v_new_status,
    updated_at = NOW()
  WHERE id = ANY(p_memory_ids)
    AND compression_status = 'active';

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  RETURN v_affected;
END;
$$;

COMMENT ON FUNCTION mark_memories_compressed IS '批量标记记忆为已压缩或已删除状态';


-- 6. 查找矛盾记忆 RPC（辅助函数）
-- ------------------------------
-- 查找同一用户、同一标签下内容相似但可能矛盾的记忆

CREATE OR REPLACE FUNCTION find_potential_contradictions(
  p_user_id UUID,
  p_similarity_threshold FLOAT DEFAULT 0.7,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  memory_id_1 UUID,
  memory_id_2 UUID,
  content_1 TEXT,
  content_2 TEXT,
  tag TEXT,
  similarity FLOAT,
  created_at_1 TIMESTAMPTZ,
  created_at_2 TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m1.id AS memory_id_1,
    m2.id AS memory_id_2,
    m1.content AS content_1,
    m2.content AS content_2,
    m1.tag,
    (1 - (m1.embedding <=> m2.embedding))::FLOAT AS similarity,
    m1.created_at AS created_at_1,
    m2.created_at AS created_at_2
  FROM user_memories m1
  JOIN user_memories m2 ON m1.user_id = m2.user_id
    AND m1.tag = m2.tag
    AND m1.id < m2.id  -- 避免重复配对
  WHERE m1.user_id = p_user_id
    AND COALESCE(m1.compression_status, 'active') = 'active'
    AND COALESCE(m2.compression_status, 'active') = 'active'
    AND m1.embedding IS NOT NULL
    AND m2.embedding IS NOT NULL
    AND (1 - (m1.embedding <=> m2.embedding)) >= p_similarity_threshold
    AND (1 - (m1.embedding <=> m2.embedding)) < 0.95  -- 排除完全重复的
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION find_potential_contradictions IS '查找可能存在矛盾的相似记忆对，用于矛盾解决';


-- 7. 更新记忆版本 RPC（辅助函数）
-- ------------------------------
-- 当记忆被新记忆替代时，更新旧记忆的 superseded_by 和版本

CREATE OR REPLACE FUNCTION supersede_memory(
  p_old_memory_id UUID,
  p_new_memory_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_version INTEGER;
BEGIN
  -- 获取旧记忆的版本
  SELECT version INTO v_old_version
  FROM user_memories
  WHERE id = p_old_memory_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 更新旧记忆
  UPDATE user_memories
  SET
    superseded_by = p_new_memory_id,
    compression_status = 'compressed',
    updated_at = NOW()
  WHERE id = p_old_memory_id;

  -- 更新新记忆的版本号
  UPDATE user_memories
  SET
    version = v_old_version + 1,
    updated_at = NOW()
  WHERE id = p_new_memory_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION supersede_memory IS '标记旧记忆被新记忆替代，更新版本链';


-- 8. 授权
-- -------

GRANT EXECUTE ON FUNCTION multi_query_search_memories TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_compression_candidates TO service_role;
GRANT EXECUTE ON FUNCTION mark_memories_compressed TO service_role;
GRANT EXECUTE ON FUNCTION find_potential_contradictions TO service_role;
GRANT EXECUTE ON FUNCTION supersede_memory TO service_role;
