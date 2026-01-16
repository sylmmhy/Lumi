-- 添加 embedding 和 merged_from 字段到 user_memories 表
-- embedding: 用于向量相似度搜索
-- merged_from: 记录被合并的记忆 ID 列表
--
-- 注意：search_similar_memories 函数和 Service role 更新权限已在之前的迁移中创建

-- 启用 pgvector 扩展（用于向量存储和搜索）
CREATE EXTENSION IF NOT EXISTS vector;

-- 添加 embedding 列 (3072 维度适用于 text-embedding-3-large)
ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS embedding vector(3072);

-- 添加 merged_from 列（存储被合并的记忆 ID）
ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS merged_from UUID[];

-- 为 embedding 创建 HNSW 索引（用于高效向量搜索）
CREATE INDEX IF NOT EXISTS idx_user_memories_embedding ON user_memories
USING hnsw (embedding vector_cosine_ops);

-- 注释
COMMENT ON COLUMN user_memories.embedding IS '记忆内容的向量嵌入，用于相似度搜索';
COMMENT ON COLUMN user_memories.merged_from IS '合并来源记忆的 ID 列表';
