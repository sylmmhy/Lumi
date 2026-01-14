# Onboarding 跳转逻辑重构计划

> **状态**: iOS 端开发完成，网页端优化完成，待测试
> **创建时间**: 2026-01-14
> **最后更新**: 2026-01-14
> **当前进度**: Phase 1 ✅ + Phase 2 ✅ + Phase 4 ✅ 完成，待 iOS 测试后开始 Phase 3 (安卓端)

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
- ✅ Phase 2: iOS 端改造（已完成，待测试）
- ⏳ Phase 3: 安卓端改造
- ✅ Phase 4: 网页端优化（已完成）
- ⏳ Phase 5: 测试验证

### 已确认的技术决策
- **平台顺序**：先 iOS，后安卓
- **查询方式**：端侧直接用 Supabase REST API 查询 users 表

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

### Phase 2: iOS 端改造 ✅ (已完成 2026-01-14)
- [x] **2.1** 在 SessionManager 中添加 `hasCompletedHabitOnboarding` 字段
- [x] **2.2** 登录成功后，从数据库查询该字段并保存（SupabaseClient.fetchHabitOnboardingStatus）
- [x] **2.3** 修改 AppCoordinator，根据该字段决定加载哪个 URL
- [x] **2.4** 添加 JS Bridge，让网页端可以通知引导完成（WebViewController.handleOnboardingCompleted）
- [x] **2.5** 收到通知后更新本地存储并跳转到主页
- [x] **2.6** 网页端添加调用 onboardingCompleted 的代码（notifyNativeOnboardingCompleted）

### Phase 3: 安卓端改造
- [ ] **3.1** 在 UserPreferences 中添加 `hasCompletedHabitOnboarding` 字段
- [ ] **3.2** 登录成功后，从数据库查询该字段并保存
- [ ] **3.3** 修改 WebTabFragment，根据该字段决定加载哪个 URL
- [ ] **3.4** 添加 JS Bridge，让网页端可以通知引导完成
- [ ] **3.5** 收到通知后更新本地存储并跳转

### Phase 4: 网页端改造 ✅ (已完成 2026-01-14)
- [x] **4.1** 移除 App.tsx 中 RootRedirect 的自动跳转逻辑（在原生 App 中跳过 onboarding 判断）
- [x] **4.2** 移除 HabitOnboardingPage 的已完成重定向检查（在原生 App 中跳过）
- [x] **4.3** 引导完成后调用端侧 JS Bridge（notifyNativeOnboardingCompleted）
- [x] **4.4** 保留纯网页访问时的兼容逻辑（非 WebView 环境自动 navigate）

### Phase 5: 测试验证
- [ ] **5.1** iOS 新用户登录流程
- [ ] **5.2** iOS 老用户登录流程
- [ ] **5.3** 安卓新用户登录流程
- [ ] **5.4** 安卓老用户登录流程
- [ ] **5.5** 纯网页访问流程

---

## 四、关键文件清单

### iOS 端 ✅ (已修改)
| 文件 | 修改内容 | 状态 |
|------|----------|------|
| `MindBoat/Configuration/AppConfiguration.swift` | 添加 `habitOnboarding` URL 常量和 `hasCompletedHabitOnboarding` key | ✅ |
| `MindBoat/Services/SessionManager.swift` | 添加 `hasCompletedHabitOnboarding` 属性 | ✅ |
| `MindBoat/Services/SupabaseClient.swift` | 添加 `fetchHabitOnboardingStatus()` 方法 | ✅ |
| `MindBoat/Coordinator/AppCoordinator.swift` | 修改 `handleLoginSuccess()` 和 `presentMainInterface()` | ✅ |
| `MindBoat/ViewControllers/WebViewConfigurationFactory.swift` | 注册 `onboardingCompleted` 消息处理器 | ✅ |
| `MindBoat/ViewControllers/WebViewController.swift` | 添加 `handleOnboardingCompleted()` 方法 | ✅ |

### 安卓端
| 文件 | 修改内容 |
|------|----------|
| `app/.../utils/UserPreferences.kt` | 添加 hasCompletedHabitOnboarding 字段 |
| `app/.../auth/LoginActivity.kt` | 登录成功后查询并保存状态 |
| `app/.../web/WebTabFragment.kt` | 修改 URL 决策逻辑 + 添加 JS Bridge |

### 网页端 ✅ (已修改)
| 文件 | 修改内容 | 状态 |
|------|----------|------|
| `src/utils/nativeTaskEvents.ts` | 添加 `notifyNativeOnboardingCompleted()` 函数 | ✅ |
| `src/hooks/useHabitOnboarding.ts` | 在 `saveAndFinish()` 中调用原生端通知 | ✅ |
| `src/App.tsx` | RootRedirect 在原生 App 中跳过 onboarding 判断 | ✅ |
| `src/pages/onboarding/HabitOnboardingPage.tsx` | 在原生 App 中跳过已完成重定向检查 | ✅ |

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
| 2026-01-14 | **iOS 端开发完成** | 修改 6 个 iOS 文件 + 2 个网页文件 |
| 2026-01-14 | **网页端优化完成** | 修改 App.tsx 和 HabitOnboardingPage.tsx，在原生 App 中跳过自动跳转逻辑 |
| 2026-01-14 | **Bug 修复** | 修复老用户本地缓存未设置导致重复进入 onboarding 的问题（见第十三节）|

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

---

## 十、Phase 2 (iOS) 实现详情

### 10.1 登录成功后的流程

```
用户登录成功
    │
    ▼
AppCoordinator.handleLoginSuccess()
    │
    ├── 1. 调用 SessionManager.handleLoginSuccess() 保存用户信息
    │
    ├── 2. 异步调用 SupabaseClient.fetchHabitOnboardingStatus()
    │       查询数据库 users 表的 has_completed_habit_onboarding 字段
    │
    ├── 3. 更新本地缓存 SessionManager.hasCompletedHabitOnboarding
    │
    └── 4. 调用 presentMainInterface(showOnboarding: !hasCompleted)
            │
            ├── showOnboarding = true  → 加载 /habit-onboarding
            └── showOnboarding = false → 加载 /app/urgency
```

### 10.2 引导完成后的流程

```
用户完成 habit onboarding
    │
    ▼
useHabitOnboarding.saveAndFinish()
    │
    ├── 1. 创建 habit reminder (数据库)
    │
    ├── 2. 调用 markHabitOnboardingCompleted() (更新数据库)
    │
    ├── 3. 调用 notifyNativeOnboardingCompleted()
    │       │
    │       ├── iOS: window.webkit.messageHandlers.onboardingCompleted.postMessage({})
    │       └── Android: window.AndroidBridge.onOnboardingCompleted() (未实现)
    │
    └── 4. 如果不在原生 App 中，则 navigate('/app/home')

iOS 端收到 onboardingCompleted 消息
    │
    ▼
WebViewController.handleOnboardingCompleted()
    │
    ├── 1. 更新本地缓存: SessionManager.hasCompletedHabitOnboarding = true
    │
    └── 2. 加载主页: loadURL(AppConfiguration.URLs.home)
```

### 10.3 关键代码位置

| 功能 | 文件 | 方法/属性 |
|------|------|-----------|
| 本地缓存 onboarding 状态 | SessionManager.swift | `hasCompletedHabitOnboarding` |
| 查询数据库 onboarding 状态 | SupabaseClient.swift | `fetchHabitOnboardingStatus()` |
| 登录后决定加载哪个 URL | AppCoordinator.swift | `handleLoginSuccess()` |
| 根据状态加载不同 URL | AppCoordinator.swift | `presentMainInterface(showOnboarding:)` |
| 注册 JS Bridge 消息 | WebViewConfigurationFactory.swift | `onboardingCompleted` handler |
| 处理 onboarding 完成消息 | WebViewController.swift | `handleOnboardingCompleted()` |
| 网页端通知原生 | nativeTaskEvents.ts | `notifyNativeOnboardingCompleted()` |
| onboarding 完成时调用 | useHabitOnboarding.ts | `saveAndFinish()` |

---

## 十一、下一步工作

### 立即可做
1. **测试 iOS 端**：在 Xcode 中编译运行
   - 测试新用户登录流程（应该加载 /habit-onboarding）
   - 测试老用户登录流程（应该加载 /app/urgency）
   - 测试完成引导后跳转（应该跳转到 /app/home）

### iOS 测试通过后
2. **Phase 3: 安卓端改造**
   - 在 UserPreferences.kt 添加 hasCompletedHabitOnboarding 字段
   - 在 LoginActivity.kt 添加查询数据库逻辑
   - 在 WebTabFragment.kt 添加 URL 决策逻辑
   - 添加 onOnboardingCompleted JS Bridge

### ~~可选优化~~ ✅ 已完成
3. **Phase 4: 网页端优化** ✅
   - 已修改 App.tsx 中 RootRedirect，在原生 App 中跳过 onboarding 判断
   - 已修改 HabitOnboardingPage，在原生 App 中跳过已完成重定向检查
   - 使用 `detectWebView().isNativeApp` 判断是否在自家原生 App 中
   - 纯网页浏览器环境保留原有跳转逻辑（兼容性）

---

## 十二、Phase 4 (网页端) 实现详情

### 12.1 核心原理

**问题**：即使端侧已经决定了加载哪个 URL，网页端仍然会在 `isSessionValidated` 后进行二次判断和跳转，导致页面闪烁。

**解决方案**：使用 `detectWebView().isNativeApp` 判断是否在自家原生 App 中：
- **原生 App 中**：跳过 onboarding 相关的自动跳转逻辑，因为端侧已经决定了 URL
- **纯网页浏览器中**：保留原有跳转逻辑，确保兼容性

### 12.2 修改的文件

#### App.tsx - RootRedirect 组件

```typescript
// 检测是否在自家原生 App 中
const isNativeApp = useMemo(() => detectWebView().isNativeApp, []);

useEffect(() => {
  // ...

  // 【原生 App 环境】直接跳转到默认页面，不做 onboarding 判断
  if (isNativeApp) {
    console.log('🏠 RootRedirect: 在原生 App 中，跳转到默认页面（端侧已决定 URL）');
    navigate(DEFAULT_APP_PATH, { replace: true });
    return;
  }

  // 【纯网页浏览器环境】保留原有跳转逻辑
  if (isLoggedIn && !hasCompletedHabitOnboarding) {
    navigate('/habit-onboarding', { replace: true });
    return;
  }

  navigate(DEFAULT_APP_PATH, { replace: true });
}, [...]);
```

#### HabitOnboardingPage.tsx - 已完成重定向检查

```typescript
// 检测是否在自家原生 App 中
const isNativeApp = useMemo(() => detectWebView().isNativeApp, []);

useEffect(() => {
  // 【原生 App 环境】跳过此检查，端侧已决定 URL
  if (isNativeApp) return;

  // 【纯网页浏览器环境】等待会话验证完成且用户已登录
  if (isSessionValidated && isLoggedIn && hasCompletedHabitOnboarding) {
    navigate(DEFAULT_APP_PATH, { replace: true });
  }
}, [...]);
```

### 12.3 detectWebView 工具函数

位置：`src/utils/webviewDetection.ts`

```typescript
// 检测是否在自家原生 App 中
function detectNativeApp(): boolean {
  // Android: 检测 AndroidBridge
  if ('AndroidBridge' in window) return true;

  // iOS: 检测 WKWebView messageHandler
  if (window.webkit?.messageHandlers?.nativeApp) return true;

  return false;
}
```

---

## 十三、Bug 修复：老用户本地缓存未设置问题

### 13.1 问题描述

**现象**：已完成 onboarding 的用户重新打开 App 时，会再次进入 onboarding 页面。

**日志表现**：
```
App 启动: 使用本地缓存的 onboarding 状态, showOnboarding = true
```

但数据库中用户的 `has_completed_habit_onboarding = true`。

### 13.2 问题根源

**场景复现**：
1. 用户在**新版 iOS 代码部署之前**就完成了 onboarding
2. 当时没有 `onboardingCompleted` JS Bridge，所以数据库被更新了
3. 但 iOS 本地的 `UserDefaults` 从未被设置过
4. 当用户重新打开 App 时，`handlePostInitialization()` 使用本地缓存
5. `UserDefaults.standard.bool()` 对于未设置的 key 默认返回 `false`
6. 所以 `showOnboarding = !false = true`，导致跳转到 onboarding 页面

**核心问题**：`handlePostInitialization()` 完全信任本地缓存，但对于老用户，本地缓存可能从未被正确设置过。

### 13.3 解决方案

修改 `AppCoordinator.handlePostInitialization()`：
1. **先使用本地缓存快速显示 UI**（避免白屏）
2. **异步查询数据库验证本地缓存**
3. **如果发现不一致，更新本地缓存并跳转到正确的页面**

### 13.4 代码修改

文件：`MindBoat/Coordinator/AppCoordinator.swift`

**新增方法** `verifyOnboardingStatusFromDatabase()`：
```swift
/// 从数据库验证 onboarding 状态，修复本地缓存与数据库不一致的问题
private func verifyOnboardingStatusFromDatabase(
    userId: String,
    localStatus: Bool,
    accessToken: String?,
    refreshToken: String?
) async {
    do {
        let databaseStatus = try await SupabaseClient.shared.fetchHabitOnboardingStatus(userId: userId)

        // 如果数据库状态和本地缓存不一致，更新本地缓存
        if databaseStatus != localStatus {
            Logger.warning("发现 onboarding 状态不一致 - 本地: \(localStatus), 数据库: \(databaseStatus)")

            await MainActor.run {
                // 更新本地缓存
                SessionManager.shared.hasCompletedHabitOnboarding = databaseStatus

                // 如果数据库显示已完成，但当前页面是 onboarding，跳转到主页
                if databaseStatus && !localStatus {
                    self.presentMainInterface(
                        animated: false,
                        propagateLoginToWeb: true,
                        accessToken: accessToken,
                        refreshToken: refreshToken,
                        showOnboarding: false
                    )
                }
            }
        }
    } catch {
        // 查询失败时不做任何处理，保持当前状态
        Logger.warning("验证 onboarding 状态失败: \(error.localizedDescription)")
    }
}
```

**修改流程**：
```
用户打开 App（已登录）
    │
    ▼
handlePostInitialization()
    │
    ├── 1. 使用本地缓存快速显示 UI（避免白屏）
    │
    └── 2. 异步调用 verifyOnboardingStatusFromDatabase()
            │
            ├── 本地缓存 = 数据库 → 无需处理
            │
            └── 本地缓存 ≠ 数据库 → 更新本地缓存，跳转到正确页面
```

### 13.5 测试验证

测试用例：用户 ID `6a9f933d-b85d-4ffe-96b2-e0ab0a36bc2e`
- 数据库状态：`has_completed_habit_onboarding = true`
- 预期行为：App 启动后，先显示 onboarding 页面，然后检测到不一致，自动跳转到主页

