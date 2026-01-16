-- 添加 task_name 字段到 user_memories 表
-- 用于存储产生该记忆时用户正在进行的任务名称

ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS task_name TEXT;

-- 为 task_name 创建索引，方便按任务查询
CREATE INDEX IF NOT EXISTS idx_user_memories_task_name ON user_memories(task_name);

-- 从现有的 metadata 中提取 taskDescription 填充 task_name
UPDATE user_memories
SET task_name = metadata->>'taskDescription'
WHERE task_name IS NULL AND metadata->>'taskDescription' IS NOT NULL;

-- 注释
COMMENT ON COLUMN user_memories.task_name IS '产生该记忆时用户正在进行的任务名称';
