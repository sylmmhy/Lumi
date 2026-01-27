-- ============================================================================
-- 用户来源追踪表 (User Referral Sources)
-- 记录用户是从哪个渠道知道 Lumi 的
-- ============================================================================

-- 创建用户来源表
CREATE TABLE IF NOT EXISTS public.user_referral_sources (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    source text NOT NULL,  -- 来源渠道：tiktok, twitter, linkedin, xiaohongshu, youtube, google, friend, appstore, other
    other_source text,     -- 如果选择 "other"，用户可以填写具体来源
    created_at timestamp with time zone DEFAULT now() NOT NULL,

    -- 每个用户只能有一条记录（可以更新）
    CONSTRAINT unique_user_referral UNIQUE (user_id)
);

-- 添加索引
CREATE INDEX idx_user_referral_sources_user_id ON public.user_referral_sources(user_id);
CREATE INDEX idx_user_referral_sources_source ON public.user_referral_sources(source);

-- 添加注释
COMMENT ON TABLE public.user_referral_sources IS '用户来源追踪表，记录用户从哪个渠道知道 Lumi';
COMMENT ON COLUMN public.user_referral_sources.source IS '来源渠道：tiktok, twitter, linkedin, xiaohongshu, youtube, google, friend, appstore, other';
COMMENT ON COLUMN public.user_referral_sources.other_source IS '如果选择 other，用户填写的具体来源';

-- 启用 RLS (Row Level Security)
ALTER TABLE public.user_referral_sources ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能访问自己的数据
CREATE POLICY "Users can view own referral source"
    ON public.user_referral_sources
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own referral source"
    ON public.user_referral_sources
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own referral source"
    ON public.user_referral_sources
    FOR UPDATE
    USING (auth.uid() = user_id);

-- 允许 service_role 完全访问（用于后端 API）
CREATE POLICY "Service role has full access to referral sources"
    ON public.user_referral_sources
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
