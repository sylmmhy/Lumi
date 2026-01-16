-- 添加 EFFECTIVE 标签到 user_memories 表
-- 用于记录 AI 成功激励用户时使用的方式

-- 1. 删除旧的约束
ALTER TABLE user_memories DROP CONSTRAINT IF EXISTS user_memories_tag_check;

-- 2. 添加新的约束（包含 EFFECTIVE）
ALTER TABLE user_memories ADD CONSTRAINT user_memories_tag_check
  CHECK (tag IN ('PREF', 'PROC', 'SOMA', 'EMO', 'SAB', 'EFFECTIVE'));

-- 3. 更新表注释
COMMENT ON COLUMN user_memories.tag IS 'PREF=AI交互偏好, PROC=拖延原因, SOMA=身心模式, EMO=情绪触发, SAB=自我破坏, EFFECTIVE=有效激励方式';

-- 4. 为 EFFECTIVE 类型创建索引（用于快速查询有效激励）
CREATE INDEX IF NOT EXISTS idx_user_memories_effective ON user_memories(user_id, tag)
  WHERE tag = 'EFFECTIVE';
