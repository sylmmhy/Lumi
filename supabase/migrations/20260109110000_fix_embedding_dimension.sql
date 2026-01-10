-- 修复 embedding 维度问题
-- 问题：search_similar_memories 函数期望特定维度的向量
-- 解决方案：统一使用 1536 维（text-embedding-3-large 通过 dimensions 参数降维）
-- 原因：HNSW 索引最多支持 2000 维

-- 1. 更新 search_similar_memories 函数
CREATE OR REPLACE FUNCTION search_similar_memories(
  p_user_id UUID,
  p_embedding TEXT,  -- JSON 格式的向量字符串
  p_tag TEXT,
  p_threshold FLOAT DEFAULT 0.85,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  tag TEXT,
  confidence FLOAT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_embedding vector(1536);
BEGIN
  -- 将 JSON 字符串转换为 vector
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

-- 2. 删除旧索引（可能是 3072 维的）
DROP INDEX IF EXISTS idx_user_memories_embedding;

-- 3. 确保 embedding 列是 1536 维
-- 注意：如果列已存在且有数据，需要先清空或重建
DO $$
BEGIN
  -- 尝试修改列类型为 1536 维
  ALTER TABLE user_memories ALTER COLUMN embedding TYPE vector(1536);
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not alter embedding column: %', SQLERRM;
END;
$$;

-- 4. 重建 HNSW 索引（高效的近似最近邻搜索）
CREATE INDEX IF NOT EXISTS idx_user_memories_embedding ON user_memories
USING hnsw (embedding vector_cosine_ops);

-- 5. 更新注释
COMMENT ON FUNCTION search_similar_memories IS '搜索语义相似的记忆（1536维向量），返回相似度高于阈值的记忆';
