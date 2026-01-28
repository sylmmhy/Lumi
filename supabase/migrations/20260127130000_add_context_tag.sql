-- 添加 CONTEXT 标签到 user_memories 表的 tag 约束
-- CONTEXT 用于存储用户的生活事件/计划（如旅行、人际关系等）

-- 删除旧的约束
ALTER TABLE user_memories DROP CONSTRAINT IF EXISTS user_memories_tag_check;

-- 添加包含 CONTEXT 的新约束
ALTER TABLE user_memories ADD CONSTRAINT user_memories_tag_check
  CHECK (tag = ANY (ARRAY['PREF'::text, 'PROC'::text, 'SOMA'::text, 'EMO'::text, 'SAB'::text, 'EFFECTIVE'::text, 'CONTEXT'::text]));
