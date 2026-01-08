-- 记忆整合功能：添加 embedding 向量、使用追踪和相似度搜索支持

-- 1. 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 添加新字段
ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS embedding vector(1536),  -- OpenAI/Azure embedding 维度
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merged_from UUID[] DEFAULT '{}';

-- 3. 创建向量相似度索引 (IVFFlat 适合中小规模数据)
CREATE INDEX IF NOT EXISTS idx_user_memories_embedding
  ON user_memories
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4. 创建复合索引用于相似记忆查询
CREATE INDEX IF NOT EXISTS idx_user_memories_user_tag
  ON user_memories(user_id, tag);

-- 5. 添加 Service role 更新权限（用于合并记忆）
CREATE POLICY "Service role can update memories" ON user_memories
  FOR UPDATE USING (true) WITH CHECK (true);

-- 6. 创建相似记忆搜索函数
CREATE OR REPLACE FUNCTION search_similar_memories(
  p_user_id UUID,
  p_embedding vector(1536),
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

-- 7. 创建更新访问记录函数
CREATE OR REPLACE FUNCTION update_memory_access(p_memory_ids UUID[])
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE user_memories
  SET
    last_accessed_at = NOW(),
    access_count = access_count + 1
  WHERE id = ANY(p_memory_ids);
END;
$$;

-- 8. 注释
COMMENT ON COLUMN user_memories.embedding IS '记忆内容的向量嵌入，用于语义相似度搜索';
COMMENT ON COLUMN user_memories.last_accessed_at IS '最后一次被检索使用的时间';
COMMENT ON COLUMN user_memories.access_count IS '被检索使用的次数';
COMMENT ON COLUMN user_memories.merged_from IS '如果是合并记忆，记录来源记忆的ID';
COMMENT ON FUNCTION search_similar_memories IS '搜索语义相似的记忆，返回相似度高于阈值的记忆';
COMMENT ON FUNCTION update_memory_access IS '批量更新记忆的访问记录';
