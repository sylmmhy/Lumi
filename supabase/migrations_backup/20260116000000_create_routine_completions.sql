-- 创建 routine_completions 表（从生产环境同步）
CREATE TABLE IF NOT EXISTS public.routine_completions (
    id uuid DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    completion_date date NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    task_name text,
    user_email text,
    UNIQUE (user_id, task_id, completion_date)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_routine_completions_user_id ON public.routine_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_routine_completions_task_id ON public.routine_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_routine_completions_date ON public.routine_completions(completion_date);

-- 启用 RLS
ALTER TABLE public.routine_completions ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "Users can view own routine completions" ON public.routine_completions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own routine completions" ON public.routine_completions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routine completions" ON public.routine_completions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own routine completions" ON public.routine_completions
    FOR DELETE USING (auth.uid() = user_id);
