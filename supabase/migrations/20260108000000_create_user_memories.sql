-- 用户记忆表 - 存储 AI 提取的行为模式和偏好
CREATE TABLE IF NOT EXISTS user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  tag TEXT NOT NULL CHECK (tag IN ('PREF', 'PROC', 'SOMA', 'EMO', 'SAB')),
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memories_tag ON user_memories(tag);
CREATE INDEX IF NOT EXISTS idx_user_memories_created_at ON user_memories(created_at DESC);

-- 全文搜索索引
CREATE INDEX IF NOT EXISTS idx_user_memories_content_search ON user_memories USING GIN (to_tsvector('english', content));

-- RLS 策略
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的记忆
CREATE POLICY "Users can view own memories" ON user_memories
  FOR SELECT USING (auth.uid() = user_id);

-- 用户可以删除自己的记忆
CREATE POLICY "Users can delete own memories" ON user_memories
  FOR DELETE USING (auth.uid() = user_id);

-- Service role 可以插入（通过 Edge Function）
CREATE POLICY "Service role can insert memories" ON user_memories
  FOR INSERT WITH CHECK (true);

-- 更新 updated_at 触发器
CREATE OR REPLACE FUNCTION update_user_memories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_memories_updated_at
  BEFORE UPDATE ON user_memories
  FOR EACH ROW
  EXECUTE FUNCTION update_user_memories_updated_at();

-- 注释
COMMENT ON TABLE user_memories IS '用户行为模式和偏好记忆，由 AI 从对话中提取';
COMMENT ON COLUMN user_memories.tag IS 'PREF=AI交互偏好, PROC=拖延原因, SOMA=身心模式, EMO=情绪触发, SAB=自我破坏';
COMMENT ON COLUMN user_memories.confidence IS 'AI 提取的置信度 0-1';
