# iOS 端启动延迟问题排查

创建时间：2026-01-15
状态：🚧 待排查

## 背景

在修复了网页端的 `onAuthStateChange` 多次触发问题后（见 `20260114-fix-onboarding-loading.md`），发现 iOS 端还有两个严重问题导致用户体验差。

**网页端修复已生效**：
- ✅ `USER_UPDATED` 多次触发问题已解决
- ✅ 网页端处理只需 120ms

**但 iOS 端有新问题**：
- ❌ 401 认证错误导致老用户被错误导航到 onboarding
- ❌ 90 秒的启动延迟

---

## 问题 1: 401 认证错误（严重！）

### 现象

老用户（已完成 onboarding）打开 App 后，被错误地导航到 `/habit-onboarding` 页面。

### 日志证据

```
21:06:37.472 🔍 Fetching onboarding status for user: 6a9f933d-b85d-4ffe-96b2-e0ab0a36bc2e
21:06:39.252 ❌ Fetch onboarding status failed with status: 401
21:06:44.993 ⚠️ 查询数据库失败: MindBoat.SupabaseError error 0，使用本地缓存
21:06:44.994 App 启动: 最终 onboarding 状态 = false, showOnboarding = true
```

### 问题链路

```
iOS 启动
    │
    ▼
fetchHabitOnboardingStatus() 发起请求
    │
    ▼
返回 401 Unauthorized ← 问题在这里！
    │
    ▼
Fallback 到本地缓存 (值为 false)
    │
    ▼
showOnboarding = true
    │
    ▼
加载 /habit-onboarding ← 错误！用户已完成 onboarding
```

### 可能原因

1. **Token 过期**：iOS 存储的 accessToken 已过期
2. **Token 未正确传递**：`fetchHabitOnboardingStatus` 发送请求时没有带 token 或 token 格式错误
3. **RLS 问题**：Supabase 的 Row Level Security 阻止了访问

### 需要排查的文件

- `MindBoat/Services/SupabaseClient.swift` - `fetchHabitOnboardingStatus()` 方法
- `MindBoat/Coordinator/AppCoordinator.swift` - 调用 `fetchHabitOnboardingStatus` 的地方
- 检查 token 刷新逻辑是否正常

### 建议的排查步骤

1. 在 `fetchHabitOnboardingStatus` 中添加日志，打印发送的 Authorization header
2. 检查 401 时的 response body，看是否有更详细的错误信息
3. 验证 token 刷新逻辑是否在 401 后被正确触发

---

## 问题 2: iOS 端 90 秒启动延迟

### 现象

从 App 启动到 WebView 加载完成，花费了约 90 秒。

### 日志证据

| 时间 | 事件 | 累计耗时 |
|------|------|---------|
| 21:06:22.932 | App 启动 | 0s |
| 21:06:30.076 | 会话状态变化: loggedIn | 7s |
| 21:06:37.468 | 发现已登录用户 | 14s |
| 21:06:44.994 | 决定 onboarding 状态 | 22s |
| 21:07:03.106 | presentMainInterface 目标 URL | **40s** ← 巨大延迟！ |
| 21:07:25.278 | loadURL 被调用 | **62s** ← 又等了 22s |
| 21:07:41.234 | WebViewController.viewDidLoad | **78s** ← 又等了 16s |
| 21:07:53.209 | WebView 开始加载 | **90s** |
| 21:07:55.228 | WebView 页面加载完成 | 92s |

### 关键延迟点

1. **21:06:44 → 21:07:03 (18秒)**：从决定 onboarding 状态到 presentMainInterface
2. **21:07:03 → 21:07:25 (22秒)**：从 presentMainInterface 到 loadURL
3. **21:07:25 → 21:07:41 (16秒)**：从 loadURL 到 viewDidLoad

### 需要排查的文件

- `MindBoat/Coordinator/AppCoordinator.swift` - `handlePostInitialization()` 和 `presentMainInterface()`
- `MindBoat/ViewControllers/WebViewController.swift` - `loadURL()` 和 `viewDidLoad()`

### 建议的排查步骤

1. 在 `handlePostInitialization` 和 `presentMainInterface` 之间添加更多日志
2. 检查是否有阻塞主线程的操作
3. 检查 UI 动画是否导致延迟

---

## 对比：网页端 vs iOS 端

| 阶段 | 网页端 | iOS 端 |
|------|--------|--------|
| 初始化 | 11ms | 7s |
| Auth 处理 | 10ms | 14s |
| onboarding 查询 | 109ms | 22s (失败) |
| 页面加载 | 0.15s | 2.02s |
| **总计** | **约 3s** | **约 90s** |

---

## 相关文件路径

- iOS 项目：`/Users/miko_mac_mini/projects/mindboat-ios-web-warpper`
- 网页项目：`/Users/miko_mac_mini/projects/firego--original-web`
- 之前的修复文档：`docs/plans/20260114-fix-onboarding-loading.md`
- Onboarding 重构计划：`docs/ONBOARDING_REFACTOR_PLAN.md`

---

## 下一步行动

1. **优先修复 401 错误**：这导致老用户体验极差
2. **排查 90 秒延迟**：在 iOS 关键节点添加日志定位延迟来源
3. **测试验证**：修复后在 iOS 真机上测试

---

## 完整日志（供参考）

### 网页端日志（21:09:16）
```
[21:09:16.273] [INFO] [DevConsole] 调试控制台已启动
[21:09:16.284] [INFO] [DevConsole] WebView 环境: native-app
[21:09:16.284] [LOG] 🔐 Web: Native Auth Bridge 已初始化
[21:09:16.284] [LOG] 🔐 Web: 发现已设置的登录态，立即处理
[21:09:16.284] [LOG] 🔐 applyNativeLogin: 开始处理, userId: 6a9f933d-b85d-4ffe-96b2-e0ab0a36bc2e
[21:09:16.284] [LOG] 🔄 会话检查触发来源: native_login
[21:09:16.284] [WARN] ⚠️ 原生登录提供的 token 不是有效的 JWT，已跳过 Supabase 会话设置
[21:09:16.284] [LOG] 🔐 applyNativeLogin: 查询 hasCompletedHabitOnboarding...
[21:09:16.293] [LOG] 🔄 定期检查：同步 Supabase session 到 localStorage
[21:09:16.294] [LOG] 🔄 Auth state changed: INITIAL_SESSION
[21:09:16.328] [LOG] 🔐 applyNativeLogin: 已在处理中，跳过重复调用
[21:09:16.403] [LOG] 🔐 applyNativeLogin: hasCompletedHabitOnboarding = true
[21:09:16.403] [LOG] 🔐 applyNativeLogin: 完成, userId: 6a9f933d-b85d-4ffe-96b2-e0ab0a36bc2e
```

### iOS 端日志（21:06:22 - 21:09:16）
```
21:06:22.932 App 启动
21:06:30.076 会话状态变化: loggedIn
21:06:37.468 发现已登录用户: 6a9f933d-b85d-4ffe-96b2-e0ab0a36bc2e
21:06:37.472 Fetching onboarding status for user
21:06:39.252 ❌ Fetch onboarding status failed with status: 401
21:06:44.993 ⚠️ 查询数据库失败，使用本地缓存
21:06:44.994 App 启动: 最终 onboarding 状态 = false, showOnboarding = true
21:07:03.106 presentMainInterface: 目标 URL = /habit-onboarding
21:07:25.278 loadURL: /habit-onboarding
21:07:41.234 WebViewController.viewDidLoad
21:07:53.209 WebView 开始加载
21:07:55.228 WebView 页面加载完成 (耗时: 2.02秒)
21:09:16.054 收到网页通知: 新手引导已完成
21:09:16.057 hasCompletedHabitOnboarding 更新为 true
21:09:16.217 WebView 页面加载完成 - URL: /app/urgency (耗时: 0.15秒)
```
