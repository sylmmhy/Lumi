# iOS Onboarding 长时间加载问题修复

创建时间：2026-01-14
状态：✅ 已完成

## 问题描述

iOS 端 onboarding 页面加载时会陷入长时间等待（41秒+），原因是：
1. `onAuthStateChange` 的 `USER_UPDATED` 事件被多次触发（200ms 内 5 次）
2. 每次触发都会查询 `hasCompletedHabitOnboarding`，没有防抖机制
3. 在原生 App 环境中，iOS 端已查询过该状态，网页端不应重复查询

## 目标

1. 添加防抖机制，避免重复查询
2. 在原生 App 环境中跳过网页端的 onboarding 状态查询
3. 添加关键日志，方便下次定位问题

## 任务清单

- [x] 步骤1：在 `onAuthStateChange` 中添加防抖逻辑，`USER_UPDATED` 事件跳过已验证用户的重复查询
- [x] 步骤2：在原生 App 环境中，跳过 `hasCompletedHabitOnboarding` 的数据库查询
- [x] 步骤3：添加关键位置的耗时日志（查询开始/结束时间、超时警告）
- [x] 步骤4：TypeScript 编译验证通过

## 修改的文件

| 文件 | 改动说明 |
|------|---------|
| src/context/AuthContext.tsx | 1. 添加 500ms 防抖逻辑（行 1812-1832）<br>2. 原生 App 环境跳过数据库查询（行 1846-1897）<br>3. 添加耗时日志（行 632-711, 1868-1896） |

## 关键代码改动说明

### 1. 防抖逻辑（行 1812-1832）
```typescript
// 用于防抖：记录上次查询的用户 ID 和时间
let lastQueryUserId: string | null = null;
let lastQueryTime = 0;
const DEBOUNCE_MS = 500; // 500ms 内同一用户的重复查询会被跳过

// 【防抖逻辑】USER_UPDATED 事件可能在短时间内多次触发（如 token 刷新）
if (event === 'USER_UPDATED' && lastQueryUserId === session.user.id && (now - lastQueryTime) < DEBOUNCE_MS) {
  console.log('🔄 onAuthStateChange: 跳过重复的 USER_UPDATED 事件（防抖）');
  return;
}
```

### 2. 原生 App 环境优化（行 1870-1897）
```typescript
// 【原生 App 优化】在原生 App 中跳过数据库查询
// iOS/Android 端已经在登录时查询过状态并决定加载哪个 URL
// 根据当前 URL 推断状态：/habit-onboarding 表示未完成，其他表示已完成
if (inNativeApp) {
  const isOnOnboardingPage = window.location.pathname.includes('habit-onboarding');
  hasCompletedHabitOnboarding = !isOnOnboardingPage;
  console.log('📱 onAuthStateChange: 原生 App 环境，跳过数据库查询');
}
```

### 3. 耗时日志
- 超过 5 秒的查询会输出警告
- 超过 3 秒的 `getSession` 调用会输出警告
- 所有查询都会输出耗时

## 预期效果

修复前：
```
[19:07:32.670] 🔄 Auth state changed: USER_UPDATED → 查询数据库
[19:07:32.854] 🔄 Auth state changed: USER_UPDATED → 查询数据库
[19:07:32.978] 🔄 Auth state changed: USER_UPDATED → 查询数据库
[19:07:33.115] 🔄 Auth state changed: USER_UPDATED → 查询数据库
[19:07:33.208] 🔄 Auth state changed: USER_UPDATED → 查询数据库
```

修复后：
```
[19:07:32.670] 🔄 Auth state changed: USER_UPDATED
[19:07:32.670] 📱 onAuthStateChange: 原生 App 环境，跳过数据库查询
[19:07:32.854] 🔄 onAuthStateChange: 跳过重复的 USER_UPDATED 事件（防抖）
[19:07:32.978] 🔄 onAuthStateChange: 跳过重复的 USER_UPDATED 事件（防抖）
...
```

## 完成后需更新的文档

- [x] 无需更新 CLAUDE.md（这是 bug 修复，不是新功能）

## 测试建议

1. 在 iOS 真机上测试新用户登录流程
2. 观察控制台日志，确认：
   - `USER_UPDATED` 事件被正确防抖
   - 原生 App 环境跳过了数据库查询
   - 耗时日志正常输出
3. 验证 onboarding 页面加载速度是否明显提升
