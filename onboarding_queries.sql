-- 📊 Onboarding Visitor System - Useful Queries

-- =============================================================================
-- 1. 检查访客状态
-- =============================================================================

-- 获取特定访客的信息
SELECT
  id,
  has_completed_onboarding,
  last_completed_onboarding_at,
  created_at,
  device_fingerprint
FROM visitors
WHERE id = 'YOUR_VISITOR_ID_HERE';

-- 查看最近的访客
SELECT
  id,
  has_completed_onboarding,
  created_at,
  ip_address,
  user_agent
FROM visitors
ORDER BY created_at DESC
LIMIT 20;

-- =============================================================================
-- 2. 查看 Onboarding 会话
-- =============================================================================

-- 获取特定访客的所有会话
SELECT
  id,
  session_id,
  visitor_id,
  user_id,
  status,
  task_description,
  started_at,
  task_ended_at,
  work_duration_seconds,
  total_duration_seconds
FROM onboarding_session
WHERE visitor_id = 'YOUR_VISITOR_ID_HERE'
ORDER BY started_at DESC;

-- 获取特定用户的所有会话（包括注册前的匿名会话）
SELECT
  os.id,
  os.session_id,
  os.visitor_id,
  os.status,
  os.task_description,
  os.started_at,
  os.task_ended_at,
  os.work_duration_seconds,
  v.has_completed_onboarding
FROM onboarding_session os
LEFT JOIN visitors v ON os.visitor_id = v.id
WHERE os.user_id = 'YOUR_USER_ID_HERE'
ORDER BY os.started_at DESC;

-- =============================================================================
-- 3. 数据分析
-- =============================================================================

-- 转化率：完成体验的访客中有多少注册了
SELECT
  COUNT(DISTINCT os.visitor_id) as total_completed_visitors,
  COUNT(DISTINCT CASE WHEN os.user_id IS NOT NULL THEN os.visitor_id END) as registered_visitors,
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN os.user_id IS NOT NULL THEN os.visitor_id END) /
    COUNT(DISTINCT os.visitor_id),
    2
  ) as conversion_rate_pct
FROM onboarding_session os
WHERE os.status = 'task_completed';

-- 每日新访客趋势
SELECT
  DATE(created_at) as date,
  COUNT(*) as new_visitors,
  COUNT(CASE WHEN has_completed_onboarding THEN 1 END) as completed_onboarding
FROM visitors
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 平均体验时长（完成的会话）
SELECT
  COUNT(*) as total_completed,
  ROUND(AVG(work_duration_seconds), 2) as avg_work_seconds,
  ROUND(AVG(chat_duration_seconds), 2) as avg_chat_seconds,
  ROUND(AVG(total_duration_seconds), 2) as avg_total_seconds,
  -- 转换为分钟
  ROUND(AVG(total_duration_seconds) / 60.0, 2) as avg_total_minutes
FROM onboarding_session
WHERE status = 'task_completed';

-- 会话状态分布
SELECT
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM onboarding_session
GROUP BY status
ORDER BY count DESC;

-- =============================================================================
-- 4. 重复访问检测（潜在滥用）
-- =============================================================================

-- 找出同一 IP 创建了多个访客的情况
SELECT
  ip_address,
  COUNT(*) as visitor_count,
  ARRAY_AGG(id) as visitor_ids,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen
FROM visitors
WHERE ip_address IS NOT NULL
GROUP BY ip_address
HAVING COUNT(*) > 3
ORDER BY visitor_count DESC;

-- 找出同一设备指纹创建了多个访客的情况
SELECT
  device_fingerprint,
  COUNT(*) as visitor_count,
  ARRAY_AGG(id) as visitor_ids
FROM visitors
WHERE device_fingerprint IS NOT NULL
GROUP BY device_fingerprint
HAVING COUNT(*) > 1
ORDER BY visitor_count DESC;

-- =============================================================================
-- 5. 数据清理（可选）
-- =============================================================================

-- 删除 30 天前未完成体验的访客记录（GDPR 合规）
-- 注意：运行前请备份数据！
-- DELETE FROM visitors
-- WHERE
--   has_completed_onboarding = false
--   AND created_at < CURRENT_DATE - INTERVAL '30 days';

-- 删除已注册用户的访客记录（节省空间，保留分析数据）
-- 注意：运行前请确认不需要这些数据！
-- DELETE FROM visitors v
-- WHERE EXISTS (
--   SELECT 1 FROM onboarding_session os
--   WHERE os.visitor_id = v.id AND os.user_id IS NOT NULL
-- )
-- AND v.created_at < CURRENT_DATE - INTERVAL '90 days';

-- =============================================================================
-- 6. 手动操作（测试/调试用）
-- =============================================================================

-- 重置特定访客的体验状态（允许再次体验）
-- UPDATE visitors
-- SET
--   has_completed_onboarding = false,
--   last_completed_onboarding_at = NULL,
--   updated_at = NOW()
-- WHERE id = 'YOUR_VISITOR_ID_HERE';

-- 手动绑定匿名会话到用户
-- UPDATE onboarding_session
-- SET user_id = 'YOUR_USER_ID_HERE'
-- WHERE visitor_id = 'YOUR_VISITOR_ID_HERE'
--   AND status = 'task_completed'
--   AND user_id IS NULL;

-- =============================================================================
-- 7. 性能监控
-- =============================================================================

-- 检查索引使用情况
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as times_used,
  idx_tup_read as rows_read,
  idx_tup_fetch as rows_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('visitors', 'onboarding_session')
ORDER BY tablename, indexname;

-- 表大小统计
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('visitors', 'onboarding_session')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
