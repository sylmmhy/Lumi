# 匿名访客体验系统 - API 实现指南

## 📋 架构概述

本系统通过 **visitors** 表和扩展的 **onboarding_session** 表实现"一个设备一次免费体验"功能：

```
┌─────────────┐         ┌──────────────────────┐         ┌─────────┐
│  Visitor    │────────>│ Onboarding Session   │────────>│  User   │
│  (匿名访客)  │ 1:N     │  (体验会话)          │  0:1    │ (注册用户)│
└─────────────┘         └──────────────────────┘         └─────────┘
```

### 核心流程

1. **首次访问** → 创建 visitor → 进入体验任务
2. **完成体验** → 标记 visitor.has_completed_onboarding = true
3. **再次访问** → 检查 visitor → 跳转登录页（不再给体验）
4. **用户注册** → 绑定 onboarding_session.user_id → 多端同步

---

## 🔌 API 端点设计

### 1. GET /api/onboarding/entry-check

**用途**: 检查访客是否可以进入体验任务

**请求参数** (Query):
```typescript
{
  visitorId?: string;  // 可选，前端从 localStorage 读取
}
```

**响应**:
```typescript
{
  canStartOnboarding: boolean;
  visitorId: string;           // 新访客会分配新 ID
  reason: 'no_visitor' | 'trial_available' | 'trial_used';
}
```

**实现示例** (TypeScript + Supabase):

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export async function checkOnboardingEntry(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const visitorId = url.searchParams.get('visitorId');

  // Case 1: No visitorId provided → Create new visitor
  if (!visitorId) {
    const { data: newVisitor, error } = await supabase
      .from('visitors')
      .insert({
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        user_agent: req.headers.get('user-agent'),
      })
      .select()
      .single();

    if (error) throw error;

    return Response.json({
      canStartOnboarding: true,
      visitorId: newVisitor.id,
      reason: 'no_visitor'
    });
  }

  // Case 2: visitorId provided → Check if trial was used
  const { data: visitor, error } = await supabase
    .from('visitors')
    .select('has_completed_onboarding')
    .eq('id', visitorId)
    .single();

  if (error || !visitor) {
    // Visitor not found, treat as new
    const { data: newVisitor, error: createError } = await supabase
      .from('visitors')
      .insert({
        ip_address: req.headers.get('x-forwarded-for'),
        user_agent: req.headers.get('user-agent'),
      })
      .select()
      .single();

    if (createError) throw createError;

    return Response.json({
      canStartOnboarding: true,
      visitorId: newVisitor.id,
      reason: 'no_visitor'
    });
  }

  // Case 3: Visitor found
  if (visitor.has_completed_onboarding) {
    return Response.json({
      canStartOnboarding: false,
      visitorId: visitorId,
      reason: 'trial_used'
    });
  }

  return Response.json({
    canStartOnboarding: true,
    visitorId: visitorId,
    reason: 'trial_available'
  });
}
```

---

### 2. POST /api/onboarding/start

**用途**: 开始体验任务（未登录用户）

**请求体**:
```typescript
{
  visitorId: string;       // 必需
  taskName?: string;       // 任务名称
  taskDescription?: string; // 任务描述
  deviceFingerprint?: string; // 可选：浏览器指纹
}
```

**响应**:
```typescript
{
  sessionId: string;       // onboarding_session.session_id
  onboardingSessionId: string; // onboarding_session.id (UUID)
  visitorId: string;
}
```

**实现示例**:

```typescript
export async function startOnboarding(req: Request): Promise<Response> {
  const { visitorId, taskName, taskDescription, deviceFingerprint } = await req.json();

  if (!visitorId) {
    return Response.json({ error: 'visitorId is required' }, { status: 400 });
  }

  // Update visitor metadata if needed
  if (deviceFingerprint) {
    await supabase
      .from('visitors')
      .update({
        device_fingerprint: deviceFingerprint,
        updated_at: new Date().toISOString()
      })
      .eq('id', visitorId);
  }

  // Create onboarding session
  const sessionId = `onboarding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const { data: session, error } = await supabase
    .from('onboarding_session')
    .insert({
      visitor_id: visitorId,
      session_id: sessionId,
      status: 'started',
      started_at: new Date().toISOString(),
      task_description: taskDescription || taskName,
      ip_address: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
      device_id: deviceFingerprint,
    })
    .select()
    .single();

  if (error) throw error;

  return Response.json({
    sessionId: session.session_id,
    onboardingSessionId: session.id,
    visitorId: visitorId,
  });
}
```

---

### 3. POST /api/onboarding/complete

**用途**: 完成体验任务（到达庆祝页面时调用）

**请求体**:
```typescript
{
  visitorId: string;
  onboardingSessionId: string; // UUID from start response
  workDurationSeconds?: number;
  chatDurationSeconds?: number;
}
```

**响应**:
```typescript
{
  success: boolean;
  message: string;
}
```

**实现示例**:

```typescript
export async function completeOnboarding(req: Request): Promise<Response> {
  const {
    visitorId,
    onboardingSessionId,
    workDurationSeconds,
    chatDurationSeconds
  } = await req.json();

  if (!visitorId || !onboardingSessionId) {
    return Response.json(
      { error: 'visitorId and onboardingSessionId are required' },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  // Update onboarding session to completed
  const { error: sessionError } = await supabase
    .from('onboarding_session')
    .update({
      status: 'task_completed',
      task_ended_at: now,
      work_duration_seconds: workDurationSeconds,
      chat_duration_seconds: chatDurationSeconds,
      total_duration_seconds: (workDurationSeconds || 0) + (chatDurationSeconds || 0),
      updated_at: now,
    })
    .eq('id', onboardingSessionId)
    .eq('visitor_id', visitorId); // Security: verify ownership

  if (sessionError) throw sessionError;

  // Mark visitor as having completed onboarding
  const { error: visitorError } = await supabase
    .from('visitors')
    .update({
      has_completed_onboarding: true,
      last_completed_onboarding_at: now,
      updated_at: now,
    })
    .eq('id', visitorId);

  if (visitorError) throw visitorError;

  return Response.json({
    success: true,
    message: 'Onboarding completed successfully'
  });
}
```

---

### 4. 扩展注册/登录 API

**修改现有的注册端点**，添加对 `visitorId` 的支持。

#### POST /api/auth/register (邮箱注册)

**请求体**:
```typescript
{
  email: string;
  password: string;
  name?: string;
  visitorId?: string;  // ← 新增：用于绑定匿名会话
}
```

**实现示例**:

```typescript
export async function registerWithEmail(req: Request): Promise<Response> {
  const { email, password, name, visitorId } = await req.json();

  // 1. Create user account (假设你用 Supabase Auth)
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) throw authError;
  const userId = authData.user!.id;

  // 2. Update users table
  await supabase
    .from('users')
    .upsert({
      id: userId,
      email,
      name,
      created_at: new Date().toISOString(),
    });

  // 3. Bind onboarding session to user if visitorId provided
  if (visitorId) {
    await bindOnboardingToUser(visitorId, userId);
  }

  return Response.json({
    success: true,
    userId,
    user: { email, name }
  });
}

// Helper function: Bind anonymous sessions to user
async function bindOnboardingToUser(visitorId: string, userId: string) {
  // Find the most recent completed onboarding session for this visitor
  const { data: sessions, error } = await supabase
    .from('onboarding_session')
    .select('*')
    .eq('visitor_id', visitorId)
    .eq('status', 'task_completed')
    .order('task_ended_at', { ascending: false })
    .limit(1);

  if (error) throw error;

  if (sessions && sessions.length > 0) {
    // Bind to user
    await supabase
      .from('onboarding_session')
      .update({ user_id: userId })
      .eq('id', sessions[0].id);
  }
}
```

#### POST /api/auth/google (Google OAuth 注册/登录)

**请求体**:
```typescript
{
  credential: string;  // Google ID token
  visitorId?: string;  // ← 新增
}
```

**实现示例**:

```typescript
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function handleGoogleAuth(req: Request): Promise<Response> {
  const { credential, visitorId } = await req.json();

  // 1. Verify Google token
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload()!;
  const { sub: googleId, email, name, picture } = payload;

  // 2. Check if user exists
  let { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('google_id', googleId)
    .single();

  let userId: string;

  if (existingUser) {
    // Existing user login
    userId = existingUser.id;
  } else {
    // New user signup
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        google_id: googleId,
        email,
        name,
        picture_url: picture,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    userId = newUser.id;

    // Bind onboarding session for new users
    if (visitorId) {
      await bindOnboardingToUser(visitorId, userId);
    }
  }

  // 3. Generate your own session token (or use Supabase Auth)
  // ... your auth logic here ...

  return Response.json({
    success: true,
    userId,
    user: { email, name, picture }
  });
}
```

---

### 5. GET /api/users/me/onboarding-latest

**用途**: 获取用户最新的体验任务记录（用于移动端展示）

**认证**: 需要用户登录（通过 Bearer token 或 session）

**响应**:
```typescript
{
  session: {
    id: string;
    sessionId: string;
    taskDescription: string | null;
    status: string;
    startedAt: string;
    taskEndedAt: string | null;
    workDurationSeconds: number | null;
    totalDurationSeconds: number | null;
  } | null
}
```

**实现示例**:

```typescript
export async function getLatestOnboarding(req: Request): Promise<Response> {
  // Extract user from auth token (假设你有认证中间件)
  const userId = req.headers.get('x-user-id'); // 示例

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: session, error } = await supabase
    .from('onboarding_session')
    .select('*')
    .eq('user_id', userId)
    .order('task_ended_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // No session found
    return Response.json({ session: null });
  }

  return Response.json({
    session: {
      id: session.id,
      sessionId: session.session_id,
      taskDescription: session.task_description,
      status: session.status,
      startedAt: session.started_at,
      taskEndedAt: session.task_ended_at,
      workDurationSeconds: session.work_duration_seconds,
      totalDurationSeconds: session.total_duration_seconds,
    }
  });
}
```

---

## 🎯 前端集成流程

### 1. 页面加载时检查

```typescript
// src/utils/onboardingVisitor.ts

const VISITOR_ID_KEY = 'firego_visitor_id';

export async function checkOnboardingAccess(): Promise<{
  canStart: boolean;
  visitorId: string;
  reason: string;
}> {
  const visitorId = localStorage.getItem(VISITOR_ID_KEY);

  const response = await fetch(`/api/onboarding/entry-check?visitorId=${visitorId || ''}`);
  const data = await response.json();

  // Save visitorId to localStorage
  localStorage.setItem(VISITOR_ID_KEY, data.visitorId);

  return {
    canStart: data.canStartOnboarding,
    visitorId: data.visitorId,
    reason: data.reason
  };
}
```

### 2. Onboarding 路由守卫

```typescript
// src/router/onboardingGuard.ts

import { checkOnboardingAccess } from '@/utils/onboardingVisitor';

export async function onboardingGuard(to: any, from: any, next: any) {
  // Check if user is logged in
  const isLoggedIn = !!localStorage.getItem('auth_token'); // 示例

  if (isLoggedIn) {
    // Logged-in users can always access onboarding
    next();
    return;
  }

  // For anonymous users, check trial status
  const { canStart, reason } = await checkOnboardingAccess();

  if (canStart) {
    next(); // Allow onboarding
  } else {
    // Trial used, redirect to login
    console.log(`Onboarding blocked: ${reason}`);
    next('/login');
  }
}
```

### 3. 开始体验任务

```typescript
// src/views/OnboardingView.tsx

import { useState } from 'react';

export function OnboardingView() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleStartTask = async (taskName: string) => {
    const visitorId = localStorage.getItem('firego_visitor_id')!;

    const response = await fetch('/api/onboarding/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorId,
        taskName,
        taskDescription: taskName,
      }),
    });

    const data = await response.json();
    setSessionId(data.sessionId);

    // Store for later use
    sessionStorage.setItem('onboarding_session_id', data.onboardingSessionId);

    // Navigate to task working view
    // ...
  };

  return (
    <div>
      <button onClick={() => handleStartTask('5-minute focus session')}>
        开始体验
      </button>
    </div>
  );
}
```

### 4. 完成体验任务

```typescript
// src/views/CelebrationView.tsx

export function CelebrationView() {
  const handleCelebration = async () => {
    const visitorId = localStorage.getItem('firego_visitor_id')!;
    const onboardingSessionId = sessionStorage.getItem('onboarding_session_id')!;

    await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorId,
        onboardingSessionId,
        workDurationSeconds: 300, // Example
        chatDurationSeconds: 60,
      }),
    });

    // Show signup CTA
    // ...
  };

  // Call on mount
  useEffect(() => {
    handleCelebration();
  }, []);

  return (
    <div>
      <h1>🎉 完成了！</h1>
      <button onClick={() => navigate('/signup')}>创建账号，继续使用</button>
    </div>
  );
}
```

### 5. 注册时绑定

```typescript
// src/views/SignupView.tsx

export function SignupView() {
  const handleSignup = async (email: string, password: string) => {
    const visitorId = localStorage.getItem('firego_visitor_id');

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        visitorId, // ← 传递 visitorId
      }),
    });

    const data = await response.json();

    if (data.success) {
      // Clear visitor session
      localStorage.removeItem('firego_visitor_id');
      sessionStorage.removeItem('onboarding_session_id');

      // Redirect to dashboard
      navigate('/dashboard');
    }
  };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      handleSignup(formData.get('email'), formData.get('password'));
    }}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button type="submit">注册</button>
    </form>
  );
}
```

---

## 🛡️ 安全性考虑

### 1. 防止滥用

虽然 `visitorId` 存储在 localStorage 中可以被清除，但这是可接受的软限制：

- **IP + User Agent 记录**：后端记录每次访问，可用于监控异常行为
- **设备指纹**（可选）：集成 [FingerprintJS](https://github.com/fingerprintjs/fingerprintjs) 提供更强的设备识别
- **速率限制**：在 API 层添加速率限制（如 10 次/小时）

### 2. 数据隐私

- 不要在 `visitors` 表中存储敏感个人信息
- IP 地址按 GDPR 要求处理（脱敏或定期清理）
- 用户注册后，可以删除对应的 visitor 记录（如果不需要分析）

### 3. 会话验证

在 `completeOnboarding` 和 `bindOnboardingToUser` 中始终验证：
- `visitor_id` 与 `onboarding_session` 的所有权
- 防止恶意用户篡改他人的会话

---

## 📱 移动端集成

iOS/Android 登录后调用 `GET /api/users/me/onboarding-latest` 获取最近的体验任务：

```typescript
// React Native example
useEffect(() => {
  async function fetchOnboarding() {
    const response = await fetch('/api/users/me/onboarding-latest', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });

    const { session } = await response.json();

    if (session && session.status === 'task_completed') {
      // Show "Continue your journey" prompt
      setShowOnboardingPrompt(true);
      setOnboardingTask(session.taskDescription);
    }
  }

  fetchOnboarding();
}, []);
```

---

## 🧪 测试检查清单

- [ ] 首次访问 → 获得新 visitorId → 可进入体验
- [ ] 完成体验 → visitor 被标记 → 再次访问跳转登录
- [ ] 清除 localStorage → 获得新 visitorId → 可再次体验（预期行为）
- [ ] 注册后 → onboarding_session.user_id 正确绑定
- [ ] 移动端登录 → 能看到网页上的体验任务
- [ ] 已登录用户 → 可以随时访问 onboarding（不受 visitor 限制）

---

## 📊 数据分析建议

可以添加以下查询来监控系统表现：

```sql
-- 1. 转化率：体验 → 注册
SELECT
  COUNT(DISTINCT visitor_id) as total_visitors,
  COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN visitor_id END) as converted_visitors,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN visitor_id END) / COUNT(DISTINCT visitor_id), 2) as conversion_rate_pct
FROM onboarding_session
WHERE status = 'task_completed';

-- 2. 平均体验时长
SELECT
  AVG(work_duration_seconds) as avg_work_seconds,
  AVG(total_duration_seconds) as avg_total_seconds
FROM onboarding_session
WHERE status = 'task_completed';

-- 3. 每日新访客数
SELECT
  DATE(created_at) as date,
  COUNT(*) as new_visitors
FROM visitors
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## 🎉 完成

数据库迁移已完成，现在你可以开始实现上述 API 端点了！

**下一步**:
1. 根据你的后端框架（Express/Fastify/etc）实现上述 API
2. 在前端添加路由守卫和访客管理逻辑
3. 测试完整流程
4. 监控数据分析指标

有问题随时问我！🚀
