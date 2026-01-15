---
title: "iOS 端启动延迟问题排查"
created: 2026-01-15
updated: 2026-01-16 01:15
stage: "🧪 测试"
due: 2026-01-17
issue: ""
---

# iOS 端启动延迟问题排查

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

## 修复进度

### ✅ 问题 1：401 认证错误 - 已修复

**根本原因**：`fetchHabitOnboardingStatus` 方法缺少 401 重试逻辑。当 accessToken 过期时，请求返回 401，代码回退到本地缓存（值为 false），导致老用户被错误导航到 onboarding。

**对比**：
- `uploadVoIPToken`（有 401 处理）→ 会刷新 token 并重试 ✅
- `fetchHabitOnboardingStatus`（没有 401 处理）→ 直接抛出错误 ❌

**修复内容** (`MindBoat/Services/SupabaseClient.swift`)：
1. 将原方法拆分为三个方法：
   - `fetchHabitOnboardingStatus` - 主入口，处理 401 重试逻辑
   - `performFetchOnboardingRequest` - 执行 HTTP 请求
   - `parseOnboardingResponse` - 解析响应数据
2. 添加 401 检测和 token 刷新重试机制（与 `uploadVoIPToken` 保持一致）

### 🔍 问题 2：90 秒启动延迟 - 已完成诊断，待优化

**诊断日志已收集（2026-01-15 22:00）**

#### 延迟时间线分解

| 时间 | 阶段 | 耗时 | 问题级别 |
|------|------|------|----------|
| 21:59:45.914 | App 启动 | 0ms | - |
| 21:59:46.762 | 开始查询 onboarding 状态 | 833ms | ✅ 正常 |
| 21:59:57.782 | 数据库查询完成 | **11 秒** | 🔴 严重 |
| 22:00:04.469 | MainActor.run 开始 | **6.7 秒** | 🔴 严重 |
| 22:00:15.727 | loadViewIfNeeded 完成 | **11 秒** | 🔴 严重 |
| 22:00:35.874 | applyNativeLogin 完成 | **16 秒** | 🔴 严重 |
| 22:00:52.649 | viewDidLoad 开始 | **17 秒** | 🔴 严重 |
| 22:00:55.821 | configureAudioSession 完成 | **3.2 秒** | 🟡 中等 |
| 22:01:05.389 | WebView 页面加载完成 | - | ✅ 正常 |

**总耗时**：约 80 秒（从 App 启动到页面可用）

#### 根本原因分析

1. **API 请求阻塞主流程**（11 秒）
   - `fetchHabitOnboardingStatus` 查询数据库花了 11 秒
   - 同时 `uploadVoIPToken` 也在执行，花了 9 秒
   - 这两个请求串行阻塞了后续 UI 显示

2. **MainActor 排队延迟**（6.7 秒）
   - `await MainActor.run` 等待了 6.7 秒才开始执行
   - 说明主线程被其他操作阻塞

3. **TabController/WebView 创建慢**（11 + 17 秒）
   - `MainTabController` 创建到 `loadViewIfNeeded` 完成花了 11 秒
   - `loadURL` 调用到 `viewDidLoad` 执行花了 17 秒
   - WKWebView 初始化本身就慢，加上主线程阻塞更慢

4. **音频配置阻塞**（3.2 秒）
   - `configureAudioSession()` 在主线程执行，花了 3.2 秒

---

## 优化方案（待实施）

### 方案 1：不阻塞主流程等待 onboarding 查询 ⭐ 优先级最高

**问题**：当前流程是串行的：
```
查询 onboarding 状态 (11秒) → 等待结果 → 显示页面
```

**优化后**：
```
立即显示页面（使用本地缓存） → 后台查询 → 如果不一致再更新
```

**修改文件**：`MindBoat/Coordinator/AppCoordinator.swift`

**修改内容**：
```swift
// handlePostInitialization() 中
// 改为：先用本地缓存显示页面，后台异步查询
let localOnboardingStatus = SessionManager.shared.hasCompletedHabitOnboarding

// 立即显示页面，不等待数据库查询
await MainActor.run {
    self.presentMainInterface(
        animated: true,
        propagateLoginToWeb: true,
        accessToken: accessToken,
        refreshToken: refreshToken,
        showOnboarding: !localOnboardingStatus  // 使用本地缓存
    )
}

// 后台异步查询，如果不一致再处理
Task {
    do {
        let databaseStatus = try await SupabaseClient.shared.fetchHabitOnboardingStatus(...)
        if databaseStatus != localOnboardingStatus {
            // 状态不一致，需要跳转
            await MainActor.run {
                // 重新加载正确的页面
            }
        }
    } catch {
        // 查询失败，保持当前页面
    }
}
```

### 方案 2：预热 WebView ⭐ 优先级高

**问题**：WebView 在需要时才创建，初始化很慢

**优化后**：App 启动时就开始预热 WebView

**修改文件**：
- `MindBoat/Coordinator/AppCoordinator.swift`
- 可能需要新建 `MindBoat/Services/WebViewPreloader.swift`

**修改内容**：
```swift
// AppCoordinator.start() 中
// 在显示登录页的同时，后台预热 WebView
presentOnboardingScreen(animated: false)

// 后台预热
Task.detached(priority: .userInitiated) {
    await WebViewPreloader.shared.warmUp()
}
```

### 方案 3：优化音频配置 ⭐ 优先级中

**问题**：`configureAudioSession()` 在主线程执行，花了 3.2 秒

**优化后**：移到后台线程

**修改文件**：`MindBoat/ViewControllers/WebViewController.swift`

**修改内容**：
```swift
// viewDidLoad() 中
// 改为后台执行
Task.detached(priority: .userInitiated) {
    AudioSessionConfigurator.shared.configure()
}
```

### 方案 4：减少 MainActor 切换 ⭐ 优先级中

**问题**：过多的 `await MainActor.run` 导致排队延迟

**优化后**：合并 MainActor 调用，减少切换次数

**修改文件**：`MindBoat/Coordinator/AppCoordinator.swift`

---

## 实施顺序与进度

1. ✅ **方案 1**：并行执行数据库查询和 UI 预热 → 预计减少 10-15 秒
2. ✅ **方案 2**：预热 WebView（已合并到方案 1 中）
3. ✅ **方案 3**：优化音频配置移到后台线程 → 预计减少 3 秒
4. ⏸️ **方案 4**：减少 MainActor 切换 → 暂缓，观察前三个方案效果

**预期优化后总耗时**：从 80 秒降到 15-25 秒

---

## 已完成的修改

### 2026-01-15 优化实施

**修改文件 1**：`MindBoat/Coordinator/AppCoordinator.swift`
- 新增 `fetchOnboardingStatusFromDatabase()` 方法：独立的数据库查询任务
- 新增 `warmupMainInterface()` 方法：预热 TabController 和 WebView
- 修改 `handlePostInitialization()`：使用 `async let` 并行执行数据库查询和 UI 预热

**修改文件 2**：`MindBoat/ViewControllers/WebViewController.swift`
- 修改 `viewDidLoad()`：音频配置改为 `Task.detached` 后台执行，不阻塞主线程

---

## 下一步行动

1. ~~**优先修复 401 错误**~~：✅ 已完成
2. ~~**排查 90 秒延迟**~~：✅ 已完成诊断，找到 4 个瓶颈
3. ~~**实施优化方案 1、2、3**~~：✅ 已完成
4. **测试验证**：在 iOS 真机上测试，确认启动时间降到 15-25 秒
5. **观察效果**：如果仍然较慢，再实施方案 4

---

## 给下一个 AI 的提示

优化方案 1、2、3 已实施完成。

**测试验证步骤**：
1. 在 Xcode 中编译运行 iOS App
2. 观察启动日志中的时间戳
3. 预期效果：App 启动到页面可用应在 15-25 秒内

如果效果不理想，可以考虑实施方案 4（减少 MainActor 切换）。

iOS 项目路径：`/Users/miko_mac_mini/projects/mindboat-ios-web-warpper`

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
