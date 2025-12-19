# 访客管理系统测试指南

## 📋 测试清单

使用此清单确保访客管理系统正确工作。

---

## 🧪 测试前准备

### 1. 确保数据库已配置

```sql
-- 检查表是否存在
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('visitors', 'onboarding_session');

-- 应该返回:
-- visitors
-- onboarding_session
```

### 2. 确保 Edge Functions 已部署

在 Supabase Dashboard → Functions 中确认：
- ✅ `onboarding-entry-check`
- ✅ `onboarding-start`
- ✅ `onboarding-complete`

### 3. 启动开发服务器

```bash
npm run dev
```

---

## 🎯 核心流程测试

### 测试 1: 首次访问 → 进入体验

**目标**: 新访客可以进入 Onboarding 体验

**步骤**:
1. 打开浏览器无痕模式
2. 访问 `http://localhost:5173`
3. 观察页面跳转

**预期结果**:
- ✅ 页面自动跳转到 `/onboarding`
- ✅ 控制台显示成功获取 visitorId
- ✅ localStorage 中存在 `firego_visitor_id`

**验证**:
```javascript
// 在浏览器控制台执行
localStorage.getItem('firego_visitor_id')
// 应该返回一个 UUID
```

---

### 测试 2: 开始体验任务

**目标**: 访客可以成功开始体验任务

**步骤**:
1. 在 Onboarding 页面输入任务描述（例如："Work out"）
2. 点击 "Help me start" 按钮
3. 观察页面和数据库变化

**预期结果**:
- ✅ 任务开始，进入工作模式
- ✅ sessionStorage 中存在 `onboarding_session_id`
- ✅ 数据库中 `onboarding_session` 表有新记录

**验证**:
```javascript
// 浏览器控制台
sessionStorage.getItem('onboarding_session_id')
```

```sql
-- Supabase SQL 编辑器
SELECT * FROM onboarding_session
ORDER BY created_at DESC
LIMIT 1;

-- 应该看到:
-- status = 'started'
-- visitor_id = 你的 visitorId
-- task_description = 你输入的任务
```

---

### 测试 3: 完成体验任务

**目标**: 访客完成任务后，系统正确标记

**步骤**:
1. 完成体验任务流程
2. 到达庆祝页面
3. 检查数据库状态

**预期结果**:
- ✅ 庆祝页面正确显示
- ✅ `visitors.has_completed_onboarding = true`
- ✅ `onboarding_session.status = 'task_completed'`
- ✅ 时长数据被正确记录

**验证**:
```sql
-- 检查访客状态
SELECT id, has_completed_onboarding, last_completed_onboarding_at
FROM visitors
WHERE id = 'YOUR_VISITOR_ID';

-- 检查会话状态
SELECT id, status, task_ended_at, work_duration_seconds, total_duration_seconds
FROM onboarding_session
WHERE visitor_id = 'YOUR_VISITOR_ID';
```

---

### 测试 4: 再次访问 → 跳转登录

**目标**: 已完成体验的访客再次访问时跳转到登录页

**步骤**:
1. 关闭当前标签页（**不要清除 localStorage**）
2. 重新打开浏览器标签页
3. 访问 `http://localhost:5173`
4. 观察页面跳转

**预期结果**:
- ✅ 页面自动跳转到 `/login/mobile`
- ✅ 控制台显示 "Onboarding blocked: trial_used"
- ✅ 无法再次进入 Onboarding

**验证**:
```javascript
// 尝试手动访问 onboarding
window.location.href = 'http://localhost:5173/onboarding'
// 应该被重定向到登录页
```

---

### 测试 5: 注册并绑定会话

**目标**: 用户注册后，体验会话绑定到账号

**步骤**:
1. 在登录页面切换到 "Sign Up" 模式
2. 输入邮箱和密码
3. 点击 "Sign Up"
4. 检查数据库绑定状态

**预期结果**:
- ✅ 注册成功，跳转到应用
- ✅ `onboarding_session.user_id` 已绑定到新用户
- ✅ localStorage 中 `firego_visitor_id` 已被清除
- ✅ sessionStorage 中 `onboarding_session_id` 已被清除

**验证**:
```javascript
// 浏览器控制台
localStorage.getItem('firego_visitor_id') // 应该返回 null
localStorage.getItem('user_id') // 应该返回新用户 ID
```

```sql
-- 检查绑定状态
SELECT
  os.id,
  os.visitor_id,
  os.user_id,
  os.status,
  u.email
FROM onboarding_session os
LEFT JOIN users u ON os.user_id = u.id
WHERE os.visitor_id = 'YOUR_VISITOR_ID';

-- 应该看到 user_id 已填充，且关联到正确的用户
```

---

### 测试 6: 清除数据重新体验

**目标**: 清除 localStorage 后可以获得新的 visitorId 重新体验

**步骤**:
1. 登出（如果已登录）
2. 清除浏览器 localStorage
3. 刷新页面
4. 观察行为

**预期结果**:
- ✅ 获得新的 visitorId
- ✅ 可以再次进入 Onboarding 体验

**验证**:
```javascript
// 浏览器控制台
localStorage.clear()
location.reload()

// 然后检查
localStorage.getItem('firego_visitor_id') // 应该是一个新的 UUID
```

⚠️ **注意**: 这是预期行为。在生产环境中可以通过 IP 限制、设备指纹等方式进一步防止滥用。

---

## 🔍 边缘情况测试

### 测试 7: 多标签页同步

**步骤**:
1. 在标签页 A 完成 Onboarding
2. 在标签页 B 刷新页面

**预期结果**:
- ✅ 标签页 B 也跳转到登录页

---

### 测试 8: 网络失败处理

**步骤**:
1. 断开网络
2. 尝试访问首页
3. 观察错误处理

**预期结果**:
- ✅ 显示友好的错误提示
- ✅ 不会崩溃

---

### 测试 9: 已登录用户访问 Onboarding

**步骤**:
1. 登录账号
2. 访问 `/onboarding`

**预期结果**:
- ✅ 已登录用户可以访问 Onboarding（不受访客限制）
- ✅ 或者根据业务逻辑跳转到应用

---

## 📊 数据分析查询

### 查询 1: 转化率分析

```sql
-- 体验到注册的转化率
SELECT
  COUNT(DISTINCT visitor_id) as total_visitors,
  COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN visitor_id END) as converted_visitors,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN visitor_id END) /
        NULLIF(COUNT(DISTINCT visitor_id), 0), 2) as conversion_rate_pct
FROM onboarding_session
WHERE status = 'task_completed';
```

### 查询 2: 平均体验时长

```sql
-- 平均工作时长和总时长
SELECT
  COUNT(*) as completed_sessions,
  ROUND(AVG(work_duration_seconds), 2) as avg_work_seconds,
  ROUND(AVG(total_duration_seconds), 2) as avg_total_seconds,
  ROUND(AVG(chat_duration_seconds), 2) as avg_chat_seconds
FROM onboarding_session
WHERE status = 'task_completed';
```

### 查询 3: 每日新访客趋势

```sql
-- 每日新访客数
SELECT
  DATE(created_at) as date,
  COUNT(*) as new_visitors,
  COUNT(CASE WHEN has_completed_onboarding THEN 1 END) as completed_onboarding
FROM visitors
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 30;
```

### 查询 4: 访客来源分析

```sql
-- 按 IP 和 User Agent 分析访客
SELECT
  ip_address,
  user_agent,
  COUNT(*) as visit_count,
  COUNT(CASE WHEN has_completed_onboarding THEN 1 END) as completed_count
FROM visitors
GROUP BY ip_address, user_agent
ORDER BY visit_count DESC
LIMIT 20;
```

---

## ⚠️ 常见问题排查

### 问题 1: 访客 ID 未保存

**症状**: localStorage 中没有 `firego_visitor_id`

**排查步骤**:
1. 检查浏览器控制台是否有错误
2. 确认 Edge Function `onboarding-entry-check` 已部署
3. 检查网络请求是否成功（Network 标签）

**解决方案**:
```javascript
// 手动测试 API
const response = await fetch('https://YOUR_PROJECT_REF.functions.supabase.co/onboarding-entry-check', {
  headers: {
    'apikey': 'YOUR_ANON_KEY'
  }
});
const data = await response.json();
console.log(data);
```

---

### 问题 2: 会话未绑定到用户

**症状**: 注册后 `onboarding_session.user_id` 为 null

**排查步骤**:
1. 检查 `AuthContext.tsx` 中的 `bindOnboardingToUser` 函数
2. 查看控制台错误日志
3. 确认 visitorId 在注册时被正确传递

**解决方案**:
```javascript
// 在注册前检查 visitorId
console.log('Visitor ID:', localStorage.getItem('firego_visitor_id'));
```

---

### 问题 3: 路由守卫不工作

**症状**: 已完成体验的访客仍能进入 Onboarding

**排查步骤**:
1. 检查 `App.tsx` 中的路由逻辑
2. 确认 API 返回正确的 `canStartOnboarding` 状态
3. 查看浏览器控制台日志

**解决方案**:
手动测试 API 响应：
```javascript
const visitorId = localStorage.getItem('firego_visitor_id');
const response = await fetch(`https://YOUR_PROJECT_REF.functions.supabase.co/onboarding-entry-check?visitorId=${visitorId}`, {
  headers: {
    'apikey': 'YOUR_ANON_KEY'
  }
});
const data = await response.json();
console.log('Can start:', data.canStartOnboarding, 'Reason:', data.reason);
```

---

## ✅ 测试完成标准

以下所有测试通过即可认为系统正常工作：

- ✅ 新访客可以进入体验
- ✅ 体验会话正确记录到数据库
- ✅ 完成体验后访客被标记
- ✅ 已完成体验的访客被重定向到登录页
- ✅ 注册时会话绑定到用户
- ✅ 访客数据在注册后被清除
- ✅ 清除 localStorage 后可以重新体验

---

## 📞 需要帮助？

如果测试中遇到问题：
1. 检查 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
2. 查看 [ONBOARDING_VISITOR_API_GUIDE.md](./ONBOARDING_VISITOR_API_GUIDE.md)
3. 在 GitHub Issues 中提问
