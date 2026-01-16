-- ==============================================================================
-- 基础 Schema 初始化
-- 此文件包含所有核心表的定义，必须在其他迁移之前运行
-- ==============================================================================

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ==============================================================================
-- 1. 用户表 (users)
-- 存储用户的基本信息，与 auth.users 关联
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  picture_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的数据
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- ==============================================================================
-- 2. 任务状态枚举
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'archived');
  END IF;
END$$;

-- ==============================================================================
-- 3. 任务表 (tasks)
-- 存储所有类型的任务：todo, routine, routine_instance
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 基本信息
  title TEXT NOT NULL,
  description TEXT,

  -- 时间相关
  time TEXT, -- HH:mm 格式
  display_time TEXT, -- h:mm am/pm 格式
  reminder_date DATE, -- 提醒日期
  timezone TEXT, -- IANA 时区标识

  -- 状态
  status task_status DEFAULT 'pending',
  called BOOLEAN DEFAULT FALSE, -- AI 是否已打电话

  -- 任务类型
  task_type TEXT CHECK (task_type IN ('todo', 'routine', 'routine_instance')),
  time_category TEXT CHECK (time_category IN ('morning', 'noon', 'afternoon', 'evening', 'latenight')),

  -- 重复任务相关
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT CHECK (recurrence_pattern IN ('daily', 'weekly', 'monthly', 'custom')),
  recurrence_days INTEGER[], -- 0-6 表示周日到周六
  recurrence_end_date DATE,
  parent_routine_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,

  -- 成功元数据
  completion_mood TEXT CHECK (completion_mood IN ('proud', 'relieved', 'satisfied', 'neutral')),
  difficulty_perception TEXT CHECK (difficulty_perception IN ('easier_than_usual', 'normal', 'harder_than_usual')),
  overcame_resistance BOOLEAN,
  actual_duration_minutes INTEGER,
  personal_best_at_completion INTEGER,
  completed_at TIMESTAMPTZ, -- 任务完成时间

  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_reminder_date ON public.tasks(reminder_date);
CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON public.tasks(user_id, reminder_date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_routine ON public.tasks(parent_routine_id);

-- 启用 RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的任务
CREATE POLICY "tasks_select_own" ON public.tasks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "tasks_insert_own" ON public.tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tasks_update_own" ON public.tasks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "tasks_delete_own" ON public.tasks
  FOR DELETE USING (auth.uid() = user_id);

-- Service role 可以访问所有任务（用于 Edge Functions）
CREATE POLICY "tasks_service_role" ON public.tasks
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ==============================================================================
-- 4. 用户设备表 (user_devices)
-- 存储用户的推送通知设备信息
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 设备标识
  device_token TEXT NOT NULL,
  device_type TEXT NOT NULL CHECK (device_type IN ('ios', 'android', 'web')),

  -- VoIP 推送专用（仅 iOS）
  voip_token TEXT,

  -- 设备信息
  device_name TEXT,
  os_version TEXT,
  app_version TEXT,

  -- 状态
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),

  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 确保同一设备不重复注册
  UNIQUE(user_id, device_token)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_token ON public.user_devices(device_token);

-- 启用 RLS
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- 用户只能管理自己的设备
CREATE POLICY "devices_select_own" ON public.user_devices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "devices_insert_own" ON public.user_devices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "devices_update_own" ON public.user_devices
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "devices_delete_own" ON public.user_devices
  FOR DELETE USING (auth.uid() = user_id);

-- Service role 可以访问所有设备（用于推送通知）
CREATE POLICY "devices_service_role" ON public.user_devices
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ==============================================================================
-- 5. 自动更新 updated_at 的触发器函数
-- ==============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为 users 表添加触发器
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 为 tasks 表添加触发器
DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 为 user_devices 表添加触发器
DROP TRIGGER IF EXISTS update_user_devices_updated_at ON public.user_devices;
CREATE TRIGGER update_user_devices_updated_at
  BEFORE UPDATE ON public.user_devices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 完成
-- ==============================================================================
COMMENT ON TABLE public.users IS '用户基本信息表，与 auth.users 关联';
COMMENT ON TABLE public.tasks IS '任务表，存储所有类型的任务（todo, routine, routine_instance）';
COMMENT ON TABLE public.user_devices IS '用户设备表，存储推送通知所需的设备信息';
