# AuthContext 模块架构

> 重构后的认证系统模块结构。原 `AuthContext.tsx`（2344 行）拆分为 12 个聚焦模块。

## 文件结构

```
src/context/
├── AuthContext.tsx              # 273 行 - 薄层编排壳
├── AuthContextDefinition.ts     #  60 行 - 类型定义 & Context 创建
└── auth/
    ├── storage.ts               # 126 行 - localStorage 读写常量和函数
    ├── sessionLock.ts           # 114 行 - setSession 互斥锁与防抖
    ├── sessionValidation.ts     # 324 行 - Supabase 会话验证（含重试）
    ├── postLoginSync.ts         #  92 行 - 登录后统一数据同步管道
    ├── analyticsSync.ts         #  47 行 - Amplitude 等埋点工具同步
    ├── userProfile.ts           # 149 行 - 用户资料 CRUD
    ├── habitOnboarding.ts       #  38 行 - habit onboarding 状态查询
    ├── nativeAuthBridge.ts      # 199 行 - iOS/Android 原生桥接
    ├── oauthCallback.ts         #  72 行 - OAuth 回调参数处理
    ├── emailAuth.ts             # 238 行 - 邮箱登录/注册/OTP 核心逻辑
    ├── logout.ts                #  67 行 - 登出清理逻辑
    └── useAuthLifecycle.ts      # 1276 行 - 认证生命周期 Hook
```

**总计**: ~3075 行（含测试基础设施）

## 模块职责

| 模块 | 职责 | 导出 |
|------|------|------|
| **AuthContext.tsx** | React Provider 薄层编排：useState、useCallback 包装、useMemo contextValue | `AuthProvider` |
| **AuthContextDefinition.ts** | `AuthState`、`AuthContextValue` 类型、`AuthContext` 创建、`useAuth` hook | 类型 + `useAuth` |
| **storage.ts** | localStorage 常量（key 名）、批量读取、读/写/清除认证状态 | `readAuthFromStorage`, `persistSessionToStorage`, `clearAuthStorage`, `LOGGED_OUT_STATE` |
| **sessionLock.ts** | `setSession` 全局互斥锁 + 防抖，防止并发 refresh token 竞态 | `canExecuteSetSession`, `acquireSetSessionLock`, `releaseSetSessionLock`, `isNetworkError` |
| **sessionValidation.ts** | 以 Supabase Auth 为权威来源验证会话，含重试机制和网络容错 | `validateSessionWithSupabase` |
| **postLoginSync.ts** | 登录成功后的统一数据同步：persist session → sync profile → analytics → habit check | `syncAfterLogin` |
| **analyticsSync.ts** | Amplitude 用户标识绑定/重置 | `bindAnalyticsUser`, `bindAnalyticsUserSync`, `resetAnalyticsUser` |
| **userProfile.ts** | `public.users` 表 CRUD：确保存在、获取、更新、同步到 localStorage | `ensureUserProfileExists`, `fetchUserProfile`, `updateUserProfile`, `syncUserProfileToStorage` |
| **habitOnboarding.ts** | 查询用户是否已完成 habit onboarding | `fetchHabitOnboardingCompleted` |
| **nativeAuthBridge.ts** | iOS/Android WebView 桥接：解析原生 payload、通知原生端、初始化桥接 | `parseNativeAuthPayload`, `notifyNativeLogout`, `initNativeAuthBridge` 等 |
| **oauthCallback.ts** | 从 URL hash/query 提取 OAuth 回调参数 | `hasOAuthCallbackParams`, `getOAuthCallbackParams`, `clearOAuthCallbackParams` |
| **emailAuth.ts** | 邮箱登录/注册/OTP 发送/验证的纯函数实现 | `performEmailLogin`, `performEmailSignup`, `performSendEmailOtp`, `performVerifyEmailOtp` |
| **logout.ts** | 登出时的设备清理、Supabase signOut、localStorage 清理 | `performLogout` |
| **useAuthLifecycle.ts** | 认证生命周期 React Hook：session 恢复、事件订阅、定期检查、Native Bridge | `useAuthLifecycle` |

## 依赖关系图

```
AuthContext.tsx
├── AuthContextDefinition.ts     (类型)
├── auth/useAuthLifecycle.ts     (生命周期 Hook)
│   ├── auth/storage.ts
│   ├── auth/sessionLock.ts
│   ├── auth/sessionValidation.ts
│   │   ├── auth/storage.ts
│   │   ├── auth/sessionLock.ts
│   │   ├── auth/habitOnboarding.ts
│   │   └── auth/nativeAuthBridge.ts
│   ├── auth/postLoginSync.ts
│   │   ├── auth/storage.ts
│   │   ├── auth/userProfile.ts
│   │   ├── auth/analyticsSync.ts
│   │   └── auth/habitOnboarding.ts
│   ├── auth/nativeAuthBridge.ts
│   ├── auth/userProfile.ts
│   ├── auth/habitOnboarding.ts
│   ├── auth/analyticsSync.ts
│   └── auth/oauthCallback.ts
├── auth/emailAuth.ts            (邮箱认证)
│   ├── auth/storage.ts
│   ├── auth/postLoginSync.ts
│   └── auth/analyticsSync.ts
├── auth/logout.ts               (登出)
│   └── auth/storage.ts
├── auth/analyticsSync.ts
├── auth/nativeAuthBridge.ts
├── auth/userProfile.ts
└── auth/storage.ts
```

## useAuthLifecycle Hook

### 参数 (`UseAuthLifecycleParams`)

| 参数 | 类型 | 说明 |
|------|------|------|
| `setAuthState` | `Dispatch<SetStateAction<AuthState>>` | React state setter |
| `logout` | `() => Promise<void>` | 登出函数 |
| `navigate` | `(to: string, options?) => void` | react-router navigate |
| `loginPath` | `string` | 登录页路径 |
| `defaultRedirectPath` | `string` | 默认重定向路径 |

### 返回值 (`UseAuthLifecycleReturn`)

| 字段 | 类型 | 说明 |
|------|------|------|
| `triggerSessionCheckNow` | `(reason?: string) => Promise<void>` | 立即触发会话检查与修复 |
| `triggerSessionCheckNowRef` | `MutableRefObject<Function \| null>` | 会话检查函数的 ref 包装 |
| `applyNativeLogin` | `(payload?) => Promise<void>` | 应用原生登录态 |
| `applyNativeLogout` | `() => void` | 应用原生登出 |
| `checkLoginState` | `() => { isLoggedIn, userId, sessionToken }` | 读取当前登录态 |
| `navigateToLogin` | `(redirectPath?) => void` | 跳转到登录页 |
| `handleOAuthCallback` | `() => Promise<void>` | 处理 OAuth 回调参数 |
| `isOAuthProcessing` | `boolean` | OAuth 回调是否正在处理中 |
| `bindOnboardingToUser` | `(visitorId, userId) => Promise<void>` | 绑定访客 onboarding 到用户 |

### 内部 useEffect 列表

1. **restoreSession + onAuthStateChange**：挂载时验证会话、订阅认证状态变化
2. **定期会话检查**：每 3 秒防抖的定时检查 + 页面可见性恢复时检查
3. **Native Bridge 事件**：监听 `mindboat:nativeLogin`、`mindboat:nativeLogout` 事件
4. **Storage 跨标签页同步**：监听 `storage` 事件，另一标签页登录/登出时同步状态
5. **OAuth 回调**：检测 URL 中的 OAuth 参数并处理
