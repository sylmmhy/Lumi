-- =====================================================
-- 记忆压缩夜间任务 Cron 配置
-- 日期：2026-01-27
-- =====================================================

-- 1. 启用 pg_cron 扩展
-- 注意：pg_cron 需要在 supabase 项目设置中手动启用
-- 如果未启用，此迁移会失败
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2. 授予 postgres 使用 cron schema 的权限
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- 3. 创建调用 memory-compressor 的函数
-- 这个函数会被 cron job 调用
CREATE OR REPLACE FUNCTION trigger_memory_compression()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- 获取 Supabase URL
  supabase_url := current_setting('app.supabase_url', true);
  IF supabase_url IS NULL THEN
    -- 从 vault 获取或使用默认值
    supabase_url := 'https://ivlfsixvfovqitkajyjc.supabase.co';
  END IF;

  -- 获取 service role key
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF service_key IS NULL THEN
    RAISE NOTICE 'Memory compression: service_role_key not found in vault';
    RETURN;
  END IF;

  -- 调用 memory-compressor Edge Function
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/memory-compressor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', service_key,
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'action', 'compress_all'
    )
  );

  RAISE NOTICE 'Memory compression triggered at %', NOW();
END;
$$;

COMMENT ON FUNCTION trigger_memory_compression IS '触发记忆压缩 Edge Function，由 cron job 调用';

-- 4. 创建夜间压缩任务
-- 每天凌晨 3:00 UTC 执行（约北京时间 11:00）
-- 可以根据用户分布调整时间

-- 先删除已存在的同名任务（如果有）
SELECT cron.unschedule('memory_nightly_compression')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'memory_nightly_compression'
);

-- 创建新的 cron 任务
SELECT cron.schedule(
  'memory_nightly_compression',  -- 任务名称
  '0 3 * * *',                   -- cron 表达式：每天 03:00 UTC
  $$SELECT trigger_memory_compression()$$
);

-- 5. 添加手动触发函数（用于测试或紧急清理）
CREATE OR REPLACE FUNCTION manual_memory_compression(p_user_id UUID DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_key TEXT;
  response jsonb;
BEGIN
  supabase_url := current_setting('app.supabase_url', true);
  IF supabase_url IS NULL THEN
    supabase_url := 'https://ivlfsixvfovqitkajyjc.supabase.co';
  END IF;

  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF service_key IS NULL THEN
    RETURN jsonb_build_object('error', 'service_role_key not found');
  END IF;

  -- 构建请求体
  IF p_user_id IS NOT NULL THEN
    response := jsonb_build_object(
      'action', 'compress_user',
      'userId', p_user_id::text
    );
  ELSE
    response := jsonb_build_object(
      'action', 'compress_all'
    );
  END IF;

  -- 调用 Edge Function
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/memory-compressor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', service_key,
      'Authorization', 'Bearer ' || service_key
    ),
    body := response
  );

  RETURN jsonb_build_object(
    'status', 'triggered',
    'action', CASE WHEN p_user_id IS NOT NULL THEN 'compress_user' ELSE 'compress_all' END,
    'user_id', p_user_id,
    'triggered_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION manual_memory_compression IS '手动触发记忆压缩，可指定单个用户或全部用户';

-- 6. 授权
GRANT EXECUTE ON FUNCTION trigger_memory_compression TO service_role;
GRANT EXECUTE ON FUNCTION manual_memory_compression TO service_role;
