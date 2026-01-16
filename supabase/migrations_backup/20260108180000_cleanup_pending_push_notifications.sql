-- =============================================
-- 清理旧的 pending_push_notifications 机制
-- =============================================
-- 这套机制是死代码：
-- - cron job 只是更新表状态，但没有任何 Edge Function 读取它
-- - 实际的推送系统使用 process_task_notifications() 直接查询 tasks 表
-- - pending_push_notifications 表中的数据从未被处理过

-- 1. 删除 cron job
SELECT cron.unschedule('process-pending-notifications');

-- 2. 删除触发器（当 routine_instance 创建时插入 pending_push_notifications）
DROP TRIGGER IF EXISTS trigger_create_push_on_routine ON tasks;

-- 3. 删除触发器函数
DROP FUNCTION IF EXISTS create_push_notification_on_routine_instance();

-- 4. 删除相关的辅助函数
DROP FUNCTION IF EXISTS get_pending_notifications(INTEGER);
DROP FUNCTION IF EXISTS mark_notification_sent(UUID, BOOLEAN, TEXT);

-- 5. 删除表（会自动删除相关索引和 RLS 策略）
DROP TABLE IF EXISTS pending_push_notifications;

-- 注意：process_task_notifications 函数的注释已移动到 20260108200000_sync_production_notification_functions.sql
-- 该函数在那个迁移中创建
