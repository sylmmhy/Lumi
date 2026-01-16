-- ==============================================================================
-- 添加 user_devices 表缺失的列
-- 用于支持 iOS VoIP/Live Activity 推送和 Android FCM 推送
-- ==============================================================================

-- 添加 platform 列（voip = iOS VoIP, fcm = Android FCM）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_devices' AND column_name = 'platform') THEN
    ALTER TABLE public.user_devices ADD COLUMN platform TEXT NOT NULL DEFAULT 'voip';
  END IF;
END $$;

-- 添加 is_sandbox 列（APNs 沙盒/生产环境标识）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_devices' AND column_name = 'is_sandbox') THEN
    ALTER TABLE public.user_devices ADD COLUMN is_sandbox BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- 添加 live_activity_token 列（iOS Live Activity 推送 token）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_devices' AND column_name = 'live_activity_token') THEN
    ALTER TABLE public.user_devices ADD COLUMN live_activity_token TEXT;
  END IF;
END $$;

-- 添加 live_activity_token_sandbox 列（Live Activity 沙盒环境标识）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_devices' AND column_name = 'live_activity_token_sandbox') THEN
    ALTER TABLE public.user_devices ADD COLUMN live_activity_token_sandbox BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- 添加索引优化按 platform 查询
CREATE INDEX IF NOT EXISTS idx_user_devices_platform ON public.user_devices(platform);

-- 添加注释
COMMENT ON COLUMN public.user_devices.platform IS '设备平台类型：voip=iOS VoIP推送, fcm=Android FCM推送';
COMMENT ON COLUMN public.user_devices.is_sandbox IS 'APNs 沙盒环境标识（仅 iOS）';
COMMENT ON COLUMN public.user_devices.live_activity_token IS 'iOS Live Activity 推送 token';
COMMENT ON COLUMN public.user_devices.live_activity_token_sandbox IS 'Live Activity 沙盒环境标识';
