-- ============================================================================
-- Cron Job: 每日目标调整
--
-- 说明：每天早上 6 点（UTC）运行 daily-goal-adjustment Edge Function
--
-- 部署方式：
--   1. 在 Supabase Dashboard -> SQL Editor 运行此脚本
--   2. 或者添加到 migrations 文件夹
--
-- 注意：需要先启用 pg_cron 和 pg_net 扩展
-- ============================================================================

-- 启用需要的扩展
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 删除旧的 cron job（如果存在）
SELECT cron.unschedule('daily-goal-adjustment')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-goal-adjustment'
);

-- 创建新的 cron job
-- 每天早上 6 点 UTC（北京时间下午 2 点）运行
-- 你可以根据用户时区调整时间
SELECT cron.schedule(
  'daily-goal-adjustment',  -- job 名称
  '0 6 * * *',              -- cron 表达式：每天 6:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-goal-adjustment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- 查看已创建的 cron jobs
SELECT * FROM cron.job;

-- ============================================================================
-- 常用 Cron 表达式参考：
--
-- '0 6 * * *'    - 每天 6:00 UTC
-- '0 22 * * *'   - 每天 22:00 UTC（北京时间早上 6 点）
-- '0 */6 * * *'  - 每 6 小时
-- '*/30 * * * *' - 每 30 分钟
-- ============================================================================

-- ============================================================================
-- 如何获取你的项目信息：
--
-- 1. YOUR_PROJECT_REF:
--    在 Supabase Dashboard -> Settings -> General -> Reference ID
--
-- 2. YOUR_SERVICE_ROLE_KEY:
--    在 Supabase Dashboard -> Settings -> API -> service_role key
--    注意：这是敏感信息，不要泄露！
-- ============================================================================
