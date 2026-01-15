# 访客管理系统部署指南

## 📋 概述

本指南将帮助你部署访客管理系统，包括：
- 部署 Supabase Edge Functions
- 配置数据库
- 测试完整流程

---

## 🚀 部署步骤

### 1. 确保数据库迁移已完成

首先，确保你已经执行了 `onboarding_queries.sql` 中的数据库迁移：

```bash
# 在 Supabase Dashboard 中执行 SQL 编辑器
# 或使用 Supabase CLI
supabase db push
```

确认以下表已创建：
- `visitors` - 访客表
- `onboarding_session` - 体验会话表（已扩展）

### 2. 部署 Supabase Edge Functions

#### 安装 Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Windows
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux
brew install supabase/tap/supabase
```

#### 登录 Supabase

```bash
supabase login
```

#### 链接项目

```bash
# 获取你的项目 ID (从 Supabase Dashboard)
supabase link --project-ref YOUR_PROJECT_REF
```

#### 部署所有 Functions

```bash
# 部署 entry-check
supabase functions deploy onboarding-entry-check

# 部署 start
supabase functions deploy onboarding-start

# 部署 complete
supabase functions deploy onboarding-complete
```

#### 一次性部署所有函数

```bash
supabase functions deploy
```

### 3. 验证部署

部署完成后，你可以在 Supabase Dashboard 中查看：

1. 前往 **Functions** 页面
2. 确认以下 3 个函数都已部署：
   - `onboarding-entry-check`
   - `onboarding-start`
   - `onboarding-complete`
3. 检查函数状态为 "Active"

### 4. 配置环境变量

Functions 会自动获取以下环境变量：
- `SUPABASE_URL` - 自动注入
- `SUPABASE_ANON_KEY` - 自动注入

无需手动配置。

---

## 🧪 测试流程

### 测试 1: Entry Check API

```bash
# 测试新访客
curl -X GET "https://YOUR_PROJECT_REF.functions.supabase.co/onboarding-entry-check" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY"

# 预期响应:
# {
#   "canStartOnboarding": true,
#   "visitorId": "uuid-here",
#   "reason": "no_visitor"
# }
```

### 测试 2: Start Onboarding

```bash
curl -X POST "https://YOUR_PROJECT_REF.functions.supabase.co/onboarding-start" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "visitorId": "YOUR_VISITOR_ID",
    "taskName": "Test Task",
    "taskDescription": "5-minute focus session"
  }'

# 预期响应:
# {
#   "sessionId": "onboarding-123...",
#   "onboardingSessionId": "uuid-here",
#   "visitorId": "uuid-here"
# }
```

### 测试 3: Complete Onboarding

```bash
curl -X POST "https://YOUR_PROJECT_REF.functions.supabase.co/onboarding-complete" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "visitorId": "YOUR_VISITOR_ID",
    "onboardingSessionId": "YOUR_SESSION_ID",
    "workDurationSeconds": 300,
    "chatDurationSeconds": 60
  }'

# 预期响应:
# {
#   "success": true,
#   "message": "Onboarding completed successfully"
# }
```

### 测试 4: 完整前端流程

1. **首次访问**
   - 打开浏览器无痕模式
   - 访问 `http://localhost:5173`
   - 应该自动进入 `/onboarding` 页面
   - 检查 localStorage 是否有 `firego_visitor_id`

2. **开始体验任务**
   - 输入任务描述
   - 点击 "Help me start"
   - 检查 sessionStorage 是否有 `onboarding_session_id`
   - 在 Supabase Dashboard 的 `onboarding_session` 表中确认记录已创建

3. **完成体验任务**
   - 完成任务流程
   - 到达庆祝页面
   - 在 Supabase Dashboard 中确认：
     - `visitors.has_completed_onboarding = true`
     - `onboarding_session.status = 'task_completed'`

4. **再次访问（已用过体验）**
   - 关闭浏览器标签页（不要清除 localStorage）
   - 重新访问 `http://localhost:5173`
   - 应该自动跳转到登录页（因为已经用过体验）

5. **注册并绑定**
   - 在登录页面注册新账号
   - 注册成功后，检查 `onboarding_session.user_id` 是否已绑定
   - `firego_visitor_id` 应该从 localStorage 中清除

6. **清除体验重新测试**
   - 清除浏览器 localStorage
   - 重新访问 `http://localhost:5173`
   - 应该能再次进入体验（获得新的 visitorId）

---

## 📊 数据验证查询

在 Supabase SQL 编辑器中运行以下查询验证数据：

```sql
-- 查看所有访客
SELECT * FROM visitors ORDER BY created_at DESC LIMIT 10;

-- 查看所有体验会话
SELECT * FROM onboarding_session ORDER BY started_at DESC LIMIT 10;

-- 查看转化率（体验 → 注册）
SELECT
  COUNT(DISTINCT visitor_id) as total_visitors,
  COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN visitor_id END) as converted_visitors,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN visitor_id END) / COUNT(DISTINCT visitor_id), 2) as conversion_rate_pct
FROM onboarding_session
WHERE status = 'task_completed';

-- 查看平均体验时长
SELECT
  AVG(work_duration_seconds) as avg_work_seconds,
  AVG(total_duration_seconds) as avg_total_seconds
FROM onboarding_session
WHERE status = 'task_completed';
```

---

## 🐛 常见问题

### Function 调用失败

**错误**: `Failed to fetch`

**解决方案**:
1. 确认 Functions 已正确部署
2. 检查 CORS 配置
3. 确认 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 配置正确

### 数据库权限错误

**错误**: `permission denied for table visitors`

**解决方案**:
确保 RLS (Row Level Security) 策略已正确配置：

```sql
-- 允许匿名用户插入访客记录
CREATE POLICY "Allow anonymous insert visitors"
ON visitors FOR INSERT
TO anon
WITH CHECK (true);

-- 允许匿名用户读取自己的访客记录
CREATE POLICY "Allow anonymous read own visitor"
ON visitors FOR SELECT
TO anon
USING (true);

-- 类似地为 onboarding_session 设置策略
CREATE POLICY "Allow anonymous insert onboarding_session"
ON onboarding_session FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Allow anonymous update own session"
ON onboarding_session FOR UPDATE
TO anon
USING (true);
```

### visitorId 未保存

**问题**: 刷新页面后 visitorId 丢失

**解决方案**:
检查 `src/utils/onboardingVisitor.ts` 中的 localStorage 操作是否正确执行。

---

## 🎯 下一步

部署完成后，你可以：

1. 在 Amplitude 或其他分析平台监控转化率
2. 添加设备指纹（FingerprintJS）以增强识别
3. 配置速率限制防止滥用
4. 优化体验流程提高转化率

---

## 📞 需要帮助？

如有问题，请检查：
- [Supabase Functions 文档](https://supabase.com/docs/guides/functions)
- [项目 GitHub Issues](https://github.com/your-repo/issues)
