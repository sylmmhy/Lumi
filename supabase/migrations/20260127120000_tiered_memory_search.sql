-- =====================================================
-- 记忆分层检索（Tiered Memory Retrieval）RPC 函数
-- =====================================================

-- 1. 分层搜索记忆
-- 根据 tier 参数在指定层级搜索向量相似的记忆
CREATE OR REPLACE FUNCTION tiered_search_memories(
  p_user_id UUID,
  p_embeddings TEXT[],           -- JSON 字符串数组，每个是一个 embedding 向量
  p_threshold FLOAT DEFAULT 0.6, -- 相似度阈值
  p_limit_per_query INT DEFAULT 5, -- 每个查询返回的最大结果数
  p_tier TEXT DEFAULT 'hot',     -- 'hot' | 'warm' | 'cold'
  p_hot_days INT DEFAULT 7,      -- 热层天数
  p_warm_days INT DEFAULT 30     -- 温层天数
)
RETURNS TABLE (
  memory_id UUID,
  content TEXT,
  tag TEXT,
  confidence FLOAT,
  importance_score FLOAT,
  similarity FLOAT,
  last_accessed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  hot_boundary TIMESTAMPTZ;
  warm_boundary TIMESTAMPTZ;
  embedding_json JSONB;
  embedding_vector vector(1536);
  i INT;
BEGIN
  -- 计算时间边界
  hot_boundary := NOW() - (p_hot_days || ' days')::INTERVAL;
  warm_boundary := NOW() - (p_warm_days || ' days')::INTERVAL;

  -- 创建临时表存储结果
  CREATE TEMP TABLE IF NOT EXISTS temp_tiered_results (
    memory_id UUID,
    content TEXT,
    tag TEXT,
    confidence FLOAT,
    importance_score FLOAT,
    similarity FLOAT,
    last_accessed_at TIMESTAMPTZ,
    query_index INT
  ) ON COMMIT DROP;

  -- 清空临时表（如果存在）
  DELETE FROM temp_tiered_results;

  -- 遍历每个 embedding 进行搜索
  FOR i IN 1..array_length(p_embeddings, 1) LOOP
    -- 解析 embedding JSON 为向量
    embedding_json := p_embeddings[i]::JSONB;
    embedding_vector := (
      SELECT array_agg(elem::FLOAT)::vector(1536)
      FROM jsonb_array_elements_text(embedding_json) AS elem
    );

    -- 根据 tier 类型执行不同的查询
    IF p_tier = 'hot' THEN
      -- 热层：最近访问 OR 从未访问（新记忆）OR 特殊标签
      INSERT INTO temp_tiered_results
      SELECT
        um.id,
        um.content,
        um.tag,
        um.confidence,
        COALESCE(um.importance_score, 0.5),
        1 - (um.embedding <=> embedding_vector) AS sim,
        um.last_accessed_at,
        i
      FROM user_memories um
      WHERE um.user_id = p_user_id
        AND um.compression_status = 'active'
        AND um.confidence >= 0.5
        AND um.embedding IS NOT NULL
        AND (
          um.last_accessed_at >= hot_boundary
          OR um.last_accessed_at IS NULL
          OR um.tag IN ('PREF', 'EFFECTIVE')
        )
        AND 1 - (um.embedding <=> embedding_vector) >= p_threshold
      ORDER BY sim DESC
      LIMIT p_limit_per_query;

    ELSIF p_tier = 'warm' THEN
      -- 温层：访问时间在热层和温层边界之间，排除特殊标签
      INSERT INTO temp_tiered_results
      SELECT
        um.id,
        um.content,
        um.tag,
        um.confidence,
        COALESCE(um.importance_score, 0.5),
        1 - (um.embedding <=> embedding_vector) AS sim,
        um.last_accessed_at,
        i
      FROM user_memories um
      WHERE um.user_id = p_user_id
        AND um.compression_status = 'active'
        AND um.confidence >= 0.5
        AND um.embedding IS NOT NULL
        AND um.last_accessed_at < hot_boundary
        AND um.last_accessed_at >= warm_boundary
        AND um.tag NOT IN ('PREF', 'EFFECTIVE')
        AND 1 - (um.embedding <=> embedding_vector) >= p_threshold
      ORDER BY sim DESC
      LIMIT p_limit_per_query;

    ELSIF p_tier = 'cold' THEN
      -- 冷层：超过温层边界，排除特殊标签
      INSERT INTO temp_tiered_results
      SELECT
        um.id,
        um.content,
        um.tag,
        um.confidence,
        COALESCE(um.importance_score, 0.5),
        1 - (um.embedding <=> embedding_vector) AS sim,
        um.last_accessed_at,
        i
      FROM user_memories um
      WHERE um.user_id = p_user_id
        AND um.compression_status = 'active'
        AND um.confidence >= 0.5
        AND um.embedding IS NOT NULL
        AND um.last_accessed_at < warm_boundary
        AND um.tag NOT IN ('PREF', 'EFFECTIVE')
        AND 1 - (um.embedding <=> embedding_vector) >= p_threshold
      ORDER BY sim DESC
      LIMIT p_limit_per_query;
    END IF;
  END LOOP;

  -- 返回去重后的结果，按相似度排序
  RETURN QUERY
  SELECT DISTINCT ON (tr.memory_id)
    tr.memory_id,
    tr.content,
    tr.tag,
    tr.confidence,
    tr.importance_score,
    tr.similarity,
    tr.last_accessed_at
  FROM temp_tiered_results tr
  ORDER BY tr.memory_id, tr.similarity DESC;
END;
$$;

-- 2. 更新记忆访问时间
-- 在记忆被检索后调用，用于维护热/温/冷分层
CREATE OR REPLACE FUNCTION update_memory_access(
  p_memory_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_memories
  SET
    last_accessed_at = NOW(),
    access_count = COALESCE(access_count, 0) + 1
  WHERE id = ANY(p_memory_ids);
END;
$$;

-- 3. 为分层检索添加复合索引（优化热层查询）
-- 注意：如果索引已存在会报错，用 IF NOT EXISTS
DO $$
BEGIN
  -- 热层索引：按 last_accessed_at 和 tag 优化
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_user_memories_tiered_hot_v2'
  ) THEN
    CREATE INDEX idx_user_memories_tiered_hot_v2
    ON user_memories (user_id, compression_status, last_accessed_at DESC NULLS FIRST)
    WHERE compression_status = 'active' AND confidence >= 0.5;
  END IF;

  -- 特殊标签索引（PREF/EFFECTIVE 始终热门）
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_user_memories_always_hot'
  ) THEN
    CREATE INDEX idx_user_memories_always_hot
    ON user_memories (user_id, tag)
    WHERE tag IN ('PREF', 'EFFECTIVE') AND compression_status = 'active';
  END IF;
END;
$$;

-- 添加注释
COMMENT ON FUNCTION tiered_search_memories IS '分层记忆搜索：根据 tier 参数（hot/warm/cold）在指定层级搜索向量相似的记忆';
COMMENT ON FUNCTION update_memory_access IS '更新记忆访问时间和访问次数，用于维护热/温/冷分层';
