# Onboarding 跳转逻辑重构计划

> **状态**: 调研完成，待开始编码
> **创建时间**: 2026-01-14
> **最后更新**: 2026-01-14
> **当前进度**: Phase 1 完成，等待用户确认后开始 Phase 2

---

## 零、给下一个会话的上下文摘要

### 我们在解决什么问题？
用户反馈：App 使用中会出现页面来回跳转（主页→引导页→主页），体验很差。

### 问题根源是什么？
- iOS/安卓端登录后**不知道**用户是否完成过引导
- 端侧固定加载某个 URL
- 网页端收到登录态后**异步查询**数据库，然后**再跳转**
- 这个异步过程造成页面闪烁

### 解决方案是什么？
**"端侧做门卫，网页端做房间"**
- 端侧登录成功后，先查数据库的 `has_completed_habit_onboarding` 字段
- 根据结果决定加载 `/habit-onboarding` 还是 `/app/home`
- 网页端移除所有自动跳转逻辑，只负责渲染当前页面

### 调研结果摘要

| 端 | 是否已存储 hasCompletedHabitOnboarding | 默认 URL | 关键文件 |
|---|---|---|---|
| **iOS** | ❌ 没有 | `/app/urgency` | SessionManager.swift, AppCoordinator.swift |
| **安卓** | ❌ 没有 | `/app/home` | UserPreferences.kt, WebTabFragment.kt |
| **网页** | ✅ 从数据库查 | 根据字段跳转 | App.tsx, AuthContext.tsx |

### 当前进度
- ✅ Phase 1: 后端准备（数据库有 `has_completed_habit_onboarding` 字段）
- ⏳ Phase 2-5: 等待用户确认后开始

### 待用户确认的问题
1. **先做哪个平台？** iOS 还是安卓？
2. **如何查询数据库？**
   - 方式 A：端侧直接用 Supabase SDK 查询
   - 方式 B：调用后端 API 返回用户信息

### 项目路径
- 网页端: `/Users/miko_mac_mini/projects/firego--original-web`
- iOS 端: `/Users/miko_mac_mini/projects/mindboat-ios-web-warpper`
- 安卓端: `/Users/miko_mac_mini/AndroidStudioProjects/FireGo`

---

## 一、问题描述

### 当前问题
用户使用 App 时会遇到页面来回跳转的情况：
- 正在使用主页 → 突然跳到引导页 → 又跳回主页

### 根本原因
1. iOS/安卓端登录成功后，不知道用户是否完成过引导
2. 端侧固定加载某个 URL（iOS: `/app/urgency`，安卓: `/app/home`）
3. 网页端收到登录态后，异步查询数据库获取 `hasCompletedHabitOnboarding`
4. 查询完成后，网页端根据结果再次跳转
5. 这个"异步查询 → 跳转"的过程造成了页面闪烁

---

## 二、目标设计

### 核心原则
> **端侧是"门卫"，网页端是"房间"**

| 角色 | 旧职责 | 新职责 |
|------|--------|--------|
| **端侧** | 登录后随便加载一个页面 | 登录后先查用户状态，决定加载哪个页面 |
| **网页端** | 收到登录态后自己判断跳转 | 只显示当前页面，不主动跳转 |

### 流程图

```
用户打开 App
    │
    ├── 没登录过 → 显示原生登录页面
    │                   │
    │                   └── 登录成功
    │                         │
    │                         ▼
    │              从数据库查询 hasCompletedHabitOnboarding
    │                         │
    │              ┌──────────┴──────────┐
    │              │                      │
    │          false (新用户)         true (老用户)
    │              │                      │
    │              ▼                      ▼
    │      打开 /habit-onboarding    打开 /app/home
    │
    └── 已登录过 → 用本地缓存的状态判断
                        │
             ┌──────────┴──────────┐
             │                      │
         未完成引导              已完成引导
             │                      │
             ▼                      ▼
     打开 /habit-onboarding    打开 /app/home
```

---

## 三、实施步骤

### Phase 1: 后端准备 ✅ (已完成)
- [x] 确认 `users` 表有 `has_completed_habit_onboarding` 字段

### Phase 2: iOS 端改造
- [ ] **2.1** 在 SessionManager 中添加 `hasCompletedHabitOnboarding` 字段
- [ ] **2.2** 登录成功后，从数据库查询该字段并保存
- [ ] **2.3** 修改 AppCoordinator，根据该字段决定加载哪个 URL
- [ ] **2.4** 添加 JS Bridge，让网页端可以通知引导完成
- [ ] **2.5** 收到通知后更新本地存储并跳转

### Phase 3: 安卓端改造
- [ ] **3.1** 在 UserPreferences 中添加 `hasCompletedHabitOnboarding` 字段
- [ ] **3.2** 登录成功后，从数据库查询该字段并保存
- [ ] **3.3** 修改 WebTabFragment，根据该字段决定加载哪个 URL
- [ ] **3.4** 添加 JS Bridge，让网页端可以通知引导完成
- [ ] **3.5** 收到通知后更新本地存储并跳转

### Phase 4: 网页端改造
- [ ] **4.1** 移除 App.tsx 中 RootRedirect 的自动跳转逻辑
- [ ] **4.2** 移除 HabitOnboardingPage 的登录检查跳转
- [ ] **4.3** 引导完成后调用端侧 JS Bridge
- [ ] **4.4** 保留纯网页访问时的兼容逻辑（非 WebView 环境）

### Phase 5: 测试验证
- [ ] **5.1** iOS 新用户登录流程
- [ ] **5.2** iOS 老用户登录流程
- [ ] **5.3** 安卓新用户登录流程
- [ ] **5.4** 安卓老用户登录流程
- [ ] **5.5** 纯网页访问流程

---

## 四、关键文件清单

### iOS 端
| 文件 | 修改内容 |
|------|----------|
| `MindBoat/Services/SessionManager.swift` | 添加 hasCompletedHabitOnboarding 字段和查询方法 |
| `MindBoat/Coordinator/AppCoordinator.swift` | 修改 URL 决策逻辑 |
| `MindBoat/Auth/WebAuthBridge.swift` | 添加 onboardingCompleted 消息处理 |
| `MindBoat/Configuration/AppConfiguration.swift` | 添加 onboarding URL 常量 |

### 安卓端
| 文件 | 修改内容 |
|------|----------|
| `app/.../utils/UserPreferences.kt` | 添加 hasCompletedHabitOnboarding 字段 |
| `app/.../auth/LoginActivity.kt` | 登录成功后查询并保存状态 |
| `app/.../web/WebTabFragment.kt` | 修改 URL 决策逻辑 + 添加 JS Bridge |

### 网页端
| 文件 | 修改内容 |
|------|----------|
| `src/App.tsx` | 移除 RootRedirect 的自动跳转 |
| `src/pages/onboarding/HabitOnboardingPage.tsx` | 移除登录检查跳转 |
| `src/hooks/useHabitOnboarding.ts` | 完成后调用端侧 Bridge |

---

## 五、JS Bridge 接口设计

### 网页端调用端侧（引导完成通知）

```javascript
// 统一接口，自动判断平台
function notifyOnboardingCompleted() {
  // iOS
  if (window.webkit?.messageHandlers?.onboardingCompleted) {
    window.webkit.messageHandlers.onboardingCompleted.postMessage({});
  }
  // Android
  else if (window.AndroidBridge?.onOnboardingCompleted) {
    window.AndroidBridge.onOnboardingCompleted();
  }
  // 纯网页（无端侧）
  else {
    // 保持现有逻辑，由网页自己跳转
    window.location.href = '/app/home';
  }
}
```

### 端侧收到通知后的处理

```
收到 onboardingCompleted 消息
    │
    ▼
更新本地存储: hasCompletedHabitOnboarding = true
    │
    ▼
跳转 WebView 到 /app/home
```

---

## 六、进度记录

| 日期 | 进度 | 备注 |
|------|------|------|
| 2026-01-14 | 完成调研 | 确认了各端现状和问题根源 |
| 2026-01-14 | 完成方案设计 | 确定"端侧做门卫"的架构 |
| | | |

---

## 七、注意事项

1. **向后兼容**：网页端需要保留纯浏览器访问的逻辑（非 WebView 环境）
2. **iOS 和安卓共享网页**：修改网页端时要同时考虑两个平台
3. **数据同步**：端侧本地存储要和数据库保持一致
4. **首次安装**：新安装用户没有本地存储，需要登录后从数据库获取

---

## 八、详细调研结果（供参考）

### iOS 端现状

**登录流程**:
1. `LoginViewController` 处理登录
2. 登录成功后调用 `SessionManager.handleLoginSuccess()` (行 87-113)
3. 保存字段: `userId`, `email`, `accessToken`, `refreshToken` 到 UserDefaults/Keychain
4. 然后 `AppCoordinator.presentMainInterface()` 加载 WebView
5. WebView 默认加载 `https://meetlumi.org/app/urgency` (AppConfiguration.swift 行 5-6)

**关键文件和行号**:
- `MindBoat/Services/SessionManager.swift:87-113` - handleLoginSuccess()
- `MindBoat/Coordinator/AppCoordinator.swift:53-93` - handlePostInitialization()
- `MindBoat/Coordinator/AppCoordinator.swift:220-240` - 登录成功处理
- `MindBoat/Auth/WebAuthBridge.swift:84-226` - 注入登录态脚本
- `MindBoat/Configuration/AppConfiguration.swift:5-6` - URL 常量

### 安卓端现状

**登录流程**:
1. `LoginActivity` 处理登录 (Google/邮箱 OTP)
2. 登录成功后调用 `userPreferences.saveXXXUser()` (行 629-636 或 832-839)
3. 保存字段: `userId`, `email`, `sessionToken`, `refreshToken`, `isLoggedIn` 等
4. 跳转到 `MainActivity`，然后加载 `WebTabFragment`
5. WebView 默认加载 `https://meetlumi.org/app/home` (WebTabFragment.kt 行 26-27)

**关键文件和行号**:
- `app/.../utils/UserPreferences.kt:64-107` - 保存用户信息
- `app/.../auth/LoginActivity.kt:617-651` - OTP 登录成功
- `app/.../auth/LoginActivity.kt:832-839` - Google 登录成功
- `app/.../web/WebTabFragment.kt:210-237` - URL 决策逻辑
- `app/.../web/WebTabFragment.kt:339-420` - 注入登录态

### 网页端现状

**自动跳转逻辑** (需要移除):
- `src/App.tsx:58-89` - RootRedirect 组件，根据 hasCompletedHabitOnboarding 跳转
- `src/pages/onboarding/HabitOnboardingPage.tsx:76-80` - 未登录跳转检查

**hasCompletedHabitOnboarding 查询位置**:
- `src/context/AuthContext.tsx:276-282` - validateSessionWithSupabase
- `src/context/AuthContext.tsx:1828-1831` - onAuthStateChange
- 以及其他 7 个位置（详见 AuthContext.tsx）

**标记完成的方法**:
- `src/context/AuthContext.tsx:1298-1325` - markHabitOnboardingCompleted()
- `src/hooks/useHabitOnboarding.ts:217` - 调用上述方法

---

## 九、下一步具体操作（示例）

### 如果先做 iOS 端

**步骤 2.1**: 在 SessionManager.swift 添加字段
```swift
// 在 SessionManager 类中添加
private let hasCompletedOnboardingKey = "has_completed_habit_onboarding"

var hasCompletedHabitOnboarding: Bool {
    get { UserDefaults.standard.bool(forKey: hasCompletedOnboardingKey) }
    set { UserDefaults.standard.set(newValue, forKey: hasCompletedOnboardingKey) }
}
```

**步骤 2.2**: 登录成功后查询数据库
```swift
// 在 handleLoginSuccess() 中添加
func fetchHabitOnboardingStatus(userId: String) async throws -> Bool {
    let response = try await supabase
        .from("users")
        .select("has_completed_habit_onboarding")
        .eq("id", userId)
        .single()
        .execute()
    // 解析并返回
}
```

**步骤 2.3**: 修改 AppCoordinator 决定 URL
```swift
// 在 presentMainInterface() 中
let url = SessionManager.shared.hasCompletedHabitOnboarding
    ? AppConfiguration.homeURL
    : AppConfiguration.onboardingURL
webViewController.loadURL(url)
```

### 如果先做安卓端

类似的修改，在 UserPreferences.kt 添加字段，LoginActivity.kt 查询数据库，WebTabFragment.kt 决定 URL。

