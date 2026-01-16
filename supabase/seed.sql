-- ==============================================================================
-- Supabase 本地开发 Seed 数据
-- 用途：每次 supabase db reset 后自动填充测试数据
-- ==============================================================================

-- 清理现有测试数据（如果存在）
-- 注意：这些 DELETE 语句会级联删除相关数据
DELETE FROM public.tasks WHERE user_id IN (
    SELECT id FROM public.users WHERE email LIKE '%@test.local'
);
DELETE FROM public.user_memories WHERE user_id IN (
    SELECT id FROM public.users WHERE email LIKE '%@test.local'
);
DELETE FROM public.users WHERE email LIKE '%@test.local';
DELETE FROM public.visitors WHERE metadata->>'is_test' = 'true';

-- ==============================================================================
-- 1. 测试用户
-- ==============================================================================
-- 注意：本地 Supabase 中，我们直接在 public.users 表创建用户
-- 实际登录需要通过 Supabase Auth，这里只是预填充数据用于测试

-- 测试用户 1：小明（活跃用户）
INSERT INTO public.users (
    id,
    display_name,
    email,
    name,
    guiding_star,
    preferences,
    has_completed_habit_onboarding,
    has_seen_screen_share_onboarding,
    created_at
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    '小明',
    'xiaoming@test.local',
    '小明 Test',
    '成为更好的自己',
    '{"theme": "light", "language": "zh-CN", "notifications": true}'::jsonb,
    true,
    true,
    NOW() - INTERVAL '30 days'
);

-- 测试用户 2：小红（新用户）
INSERT INTO public.users (
    id,
    display_name,
    email,
    name,
    guiding_star,
    preferences,
    has_completed_habit_onboarding,
    has_seen_screen_share_onboarding,
    created_at
) VALUES (
    '22222222-2222-2222-2222-222222222222',
    '小红',
    'xiaohong@test.local',
    '小红 Test',
    NULL,
    '{"theme": "dark", "language": "zh-CN"}'::jsonb,
    false,
    false,
    NOW() - INTERVAL '2 days'
);

-- 测试用户 3：John（英文用户）
INSERT INTO public.users (
    id,
    display_name,
    email,
    name,
    guiding_star,
    preferences,
    has_completed_habit_onboarding,
    has_seen_screen_share_onboarding,
    created_at
) VALUES (
    '33333333-3333-3333-3333-333333333333',
    'John',
    'john@test.local',
    'John Doe',
    'Build healthy habits',
    '{"theme": "light", "language": "en"}'::jsonb,
    true,
    true,
    NOW() - INTERVAL '7 days'
);

-- ==============================================================================
-- 2. 测试任务（小明的任务）
-- ==============================================================================

-- 待办任务：今天的任务
INSERT INTO public.tasks (
    id,
    user_id,
    title,
    description,
    status,
    priority,
    category,
    task_type,
    time,
    display_time,
    reminder_date,
    time_category,
    timezone,
    created_at
) VALUES
(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    '完成项目报告',
    '写完 Q1 季度总结报告',
    'pending',
    1,
    'important_urgent',
    'todo',
    '14:00',
    '2:00 PM',
    CURRENT_DATE,
    'afternoon',
    'Asia/Shanghai',
    NOW() - INTERVAL '2 hours'
),
(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '11111111-1111-1111-1111-111111111111',
    '回复邮件',
    '回复客户关于产品功能的询问',
    'pending',
    2,
    'important_not_urgent',
    'todo',
    '16:00',
    '4:00 PM',
    CURRENT_DATE,
    'afternoon',
    'Asia/Shanghai',
    NOW() - INTERVAL '1 hour'
),
(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '11111111-1111-1111-1111-111111111111',
    '晨间冥想',
    '10 分钟正念冥想',
    'completed',
    2,
    'important_not_urgent',
    'routine',
    '07:00',
    '7:00 AM',
    CURRENT_DATE,
    'morning',
    'Asia/Shanghai',
    NOW() - INTERVAL '5 hours',
    NOW() - INTERVAL '4 hours'
);

-- 更新已完成任务的完成时间
UPDATE public.tasks
SET completed_at = NOW() - INTERVAL '4 hours',
    completion_mood = 'satisfied',
    difficulty_perception = 'normal',
    actual_duration_minutes = 12
WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- 历史任务：昨天完成的任务
INSERT INTO public.tasks (
    id,
    user_id,
    title,
    status,
    priority,
    category,
    task_type,
    completed_at,
    completion_mood,
    difficulty_perception,
    overcame_resistance,
    actual_duration_minutes,
    created_at
) VALUES
(
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '11111111-1111-1111-1111-111111111111',
    '学习 React 新特性',
    'completed',
    2,
    'important_not_urgent',
    'todo',
    NOW() - INTERVAL '1 day',
    'proud',
    'harder_than_usual',
    true,
    45,
    NOW() - INTERVAL '2 days'
),
(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    '11111111-1111-1111-1111-111111111111',
    '健身 30 分钟',
    'completed',
    2,
    'important_not_urgent',
    'routine',
    NOW() - INTERVAL '1 day',
    'relieved',
    'normal',
    false,
    35,
    NOW() - INTERVAL '1 day'
);

-- ==============================================================================
-- 3. 测试任务（小红的任务 - 新用户，少量数据）
-- ==============================================================================

INSERT INTO public.tasks (
    id,
    user_id,
    title,
    status,
    priority,
    category,
    task_type,
    time,
    display_time,
    reminder_date,
    timezone,
    created_at
) VALUES
(
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '22222222-2222-2222-2222-222222222222',
    '尝试第一个任务',
    'pending',
    2,
    'important_not_urgent',
    'todo',
    '10:00',
    '10:00 AM',
    CURRENT_DATE,
    'Asia/Shanghai',
    NOW() - INTERVAL '30 minutes'
);

-- ==============================================================================
-- 4. 测试用户记忆（小明的 AI 记忆）
-- ==============================================================================

INSERT INTO public.user_memories (
    id,
    user_id,
    memory_text,
    memory_tag,
    source_task_name,
    created_at
) VALUES
(
    '11111111-aaaa-aaaa-aaaa-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '用户喜欢简短直接的鼓励，不喜欢太啰嗦的表达',
    'PREF',
    NULL,
    NOW() - INTERVAL '14 days'
),
(
    '11111111-bbbb-bbbb-bbbb-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '在写报告时容易拖延，主要是因为担心写不好',
    'PROC',
    '完成项目报告',
    NOW() - INTERVAL '7 days'
),
(
    '11111111-cccc-cccc-cccc-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '运动前会感到身体沉重，但运动后会感觉很好',
    'SOMA',
    '健身 30 分钟',
    NOW() - INTERVAL '5 days'
),
(
    '11111111-dddd-dddd-dddd-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '告诉用户"只需要先打开文件看一眼"这种微小起步的方式对他很有效',
    'EFFECTIVE',
    '完成项目报告',
    NOW() - INTERVAL '3 days'
),
(
    '11111111-eeee-eeee-eeee-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '提醒用户过去克服困难的经历能给他信心',
    'EFFECTIVE',
    NULL,
    NOW() - INTERVAL '1 day'
);

-- ==============================================================================
-- 5. 测试访客数据
-- ==============================================================================

-- 已完成 onboarding 的访客
INSERT INTO public.visitors (
    id,
    has_completed_onboarding,
    last_completed_onboarding_at,
    user_agent,
    metadata,
    created_at
) VALUES
(
    'aaaa1111-1111-1111-1111-111111111111',
    true,
    NOW() - INTERVAL '1 day',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    '{"is_test": "true", "source": "seed_data"}'::jsonb,
    NOW() - INTERVAL '2 days'
);

-- 未完成 onboarding 的访客（可以体验）
INSERT INTO public.visitors (
    id,
    has_completed_onboarding,
    user_agent,
    metadata,
    created_at
) VALUES
(
    'bbbb2222-2222-2222-2222-222222222222',
    false,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    '{"is_test": "true", "source": "seed_data"}'::jsonb,
    NOW() - INTERVAL '1 hour'
);

-- ==============================================================================
-- 6. 输出确认信息
-- ==============================================================================

DO $$
DECLARE
    user_count INT;
    task_count INT;
    memory_count INT;
    visitor_count INT;
BEGIN
    SELECT COUNT(*) INTO user_count FROM public.users WHERE email LIKE '%@test.local';
    SELECT COUNT(*) INTO task_count FROM public.tasks WHERE user_id IN (
        SELECT id FROM public.users WHERE email LIKE '%@test.local'
    );
    SELECT COUNT(*) INTO memory_count FROM public.user_memories WHERE user_id IN (
        SELECT id FROM public.users WHERE email LIKE '%@test.local'
    );
    SELECT COUNT(*) INTO visitor_count FROM public.visitors WHERE metadata->>'is_test' = 'true';

    RAISE NOTICE '✅ Seed 数据填充完成！';
    RAISE NOTICE '   - 测试用户: % 个', user_count;
    RAISE NOTICE '   - 测试任务: % 个', task_count;
    RAISE NOTICE '   - 测试记忆: % 条', memory_count;
    RAISE NOTICE '   - 测试访客: % 个', visitor_count;
    RAISE NOTICE '';
    RAISE NOTICE '📧 测试账号:';
    RAISE NOTICE '   - xiaoming@test.local (活跃用户，有任务和记忆)';
    RAISE NOTICE '   - xiaohong@test.local (新用户)';
    RAISE NOTICE '   - john@test.local (英文用户)';
END $$;
