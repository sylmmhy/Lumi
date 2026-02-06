# AuthContext.tsx 重构计划（综合版）

> 综合两轮分析，基于当前代码实际状态（已完成第一轮抽离后的 2344 行版本）制定。
> 原则：**先搬家不改逻辑，对外 API 不变，每步可验证。**

---

## 现状分析

### 已抽离的模块（第一轮重构成果）

| 模块 | 行数 | 职责 |
|------|------|------|
| `auth/analyticsSync.ts` | ~48 | 埋点用户绑定/重置 |
| `auth/oauthCallback.ts` | ~73 | OAuth URL 参数解析/清理 |
| `auth/userProfile.ts` | ~150 | 用户资料 CRUD + localStorage 同步 |
| `auth/nativeAuthBridge.ts` | ~200 | 原生端 JS Bridge 通信工具函数 |
| `auth/habitOnboarding.ts` | ~38 | 查询 habit onboarding 完成状态 |

### 仍留在 AuthContext.tsx 的部分

| 区域 | 行号范围 | 约行数 | 说明 |
|------|---------|--------|------|
| `declare global` | 59-148 | ~90 | Window / Event 类型声明 |
| 常量 + storage 工具 | 40-310 | ~140 | `AUTH_STORAGE_KEYS`、localStorage 读写、`clearAuthStorage` 等 |
| setSession 互斥锁 | 170-215 | ~45 | 防 refresh token 竞态的全局锁 |
| `isNetworkError` | 233-256 | ~25 | 网络错误判断 |
| `validateSessionWithSupabase` | 335-623 | ~290 | 会话验证大函数（不依赖 React） |
| **AuthProvider 主体** | 635-2344 | ~1710 | 组件 + 所有 useCallback / useEffect |

### AuthProvider 内部最重的区块

| 函数/区块 | 约行数 | 问题 |
|-----------|--------|------|
| 登录方法（login/signup/auth/verifyOtp/sendOtp） | ~330 | 4-5 处重复的"登录成功后流水线" |
| `applyNativeLogin` | ~220 | 最复杂的单函数，多层竞态保护 |
| `restoreSession` + `onAuthStateChange` useEffect | ~350 | 6 个竞态保护分支 |
| `triggerSessionCheckNow` | ~120 | 定期会话修复 |
| Native Bridge useEffect | ~115 | 事件监听 + 兜底轮询 + 可见性恢复 |

### 核心重复问题

**登录成功后流水线**在 4+ 处几乎重复：

```
写 localStorage → syncUserProfileToStorage → 取 userName/userPicture →
bindAnalytics → fetchHabitOnboardingCompleted → setAuthState(isSessionValidated: true)
```

出现在：`loginWithEmail`、`verifyEmailOtp`（含 dev backdoor）、`onAuthStateChange`、`applyNativeLogin`

**已登出状态字面量**出现 4 次：

```ts
{ isLoggedIn: false, userId: null, userEmail: null, userName: null, userPicture: null,
  isNewUser: false, sessionToken: null, refreshToken: null, isNativeLogin: false,
  isSessionValidated: true, hasCompletedHabitOnboarding: false }
```

出现在：`logout`、`fullReset`、`SIGNED_OUT` 事件、`validateSessionWithSupabase` 返回

---

## 重构目标

1. 不改 `AuthContextValue` 形状与 `AuthProvider` 导出（`AuthContextDefinition.ts` 保持不动）
2. 先"搬家"，再"去重复"，最后才动高风险的并发/时序逻辑
3. 最终目标：AuthProvider 缩减到 ~300-400 行，只负责组合 hooks + 暴露 context value

---

## 第 0 阶段：回归清单（不改代码，先保命）

**原理**：AuthContext 里有大量 iOS WebView 时序/并发保护（互斥锁、防抖、bootstrap window），重构最怕"看起来没改逻辑，但某个角落断了"。

### 每个阶段完成后必须执行

```bash
npm run lint
npm run build
```

### 手工回归清单（最少覆盖）

- [ ] **Web 密码登录**：邮箱密码登录 → 登出 → 刷新页面后仍保持登录
- [ ] **Web OTP 登录**：发送验证码 → 输入验证码登录 → 登出
- [ ] **OAuth 回调**：带 code 或 access_token 回调能登录成功，URL 参数被清理
- [ ] **多标签页同步**：A 标签页登录/登出，B 标签页能跟随（storage 事件）
- [ ] **Native WebView**：启动时不误触发原生登出；收到 nativeLogin 后只处理一次；能发送 authConfirmed；挂起恢复后不出现 setSession 风暴

---

## 第 1 阶段：纯工具 + storage + 类型声明搬家（零风险）

**原理**：把 localStorage key/读写集中起来，后续改 key 或补字段不用全文件搜替换。同时把类型声明移出业务代码。

### 操作

#### 1a. 新建 `auth/storage.ts`

从 AuthContext.tsx 搬过去（只改位置，不改代码）：

- `AUTH_STORAGE_KEYS`、`NATIVE_LOGIN_FLAG_KEY`（line 40-53）
- `batchGetLocalStorage`（line 221）
- `readAuthFromStorage`（line 262）
- `persistSessionToStorage`（line 289）
- `clearAuthStorage`（line 302）
- **新增** `LOGGED_OUT_STATE` 常量 — 消除 4 处重复的已登出状态字面量

```ts
/** 已验证的登出状态（统一常量，避免多处重复） */
export const LOGGED_OUT_STATE: AuthState = {
  isLoggedIn: false, userId: null, userEmail: null, userName: null,
  userPicture: null, isNewUser: false, sessionToken: null, refreshToken: null,
  isNativeLogin: false, isSessionValidated: true, hasCompletedHabitOnboarding: false,
} as const;
```

> **注意**：使用时必须展开写 `setAuthState({ ...LOGGED_OUT_STATE })`，不要直接传引用 `setAuthState(LOGGED_OUT_STATE)`。
> 原因：如果多处共享同一个对象引用，万一有人误写 `state.xxx = yyy` 会污染常量。展开写法成本为零，杜绝隐患。

#### 1b. 把 `declare global` 移到 `src/types/mindboat-native.d.ts`

Window 接口和 DocumentEventMap 声明与 AuthContext 业务逻辑无关，属于全局类型定义。

> **踩坑提醒：`.d.ts` 中引用其他模块类型的写法**
>
> 当前 `declare global` 块引用了 `NativeAuthPayload`（来自 `AuthContextDefinition.ts`）。
> 如果在 `.d.ts` 文件顶层写 `import { NativeAuthPayload } from ...`，TypeScript 会将该文件视为模块，
> `declare global` 将不再全局生效。
>
> **正确写法**：使用 `import()` 类型引用，不写顶层 import：
> ```ts
> // src/types/mindboat-native.d.ts
> declare global {
>   interface Window {
>     MindBoatNativeAuth?: import('../context/AuthContextDefinition').NativeAuthPayload;
>     __MindBoatAuthReady?: boolean;
>     // ...其余字段
>   }
>   interface DocumentEventMap {
>     'mindboat:nativeLogin': CustomEvent<import('../context/AuthContextDefinition').NativeAuthPayload>;
>     // ...
>   }
> }
> export {}; // 确保 TypeScript 将文件视为模块（必须有这行）
> ```

#### 1c. AuthContext.tsx 改为 import

```ts
import { AUTH_STORAGE_KEYS, NATIVE_LOGIN_FLAG_KEY, batchGetLocalStorage,
  readAuthFromStorage, persistSessionToStorage, clearAuthStorage, LOGGED_OUT_STATE
} from './auth/storage';
```

### 验收点

- 编译通过
- 登录/登出后 localStorage 行为一致（DevTools 检查 key）
- `logout`、`fullReset`、`SIGNED_OUT`、`validateSessionWithSupabase` 中的登出状态改用 `LOGGED_OUT_STATE`

### 预计减少 ~230 行

---

## 第 2 阶段：setSession 互斥锁 + 网络错误判断（低风险）

**原理**：这是"防 refresh token 竞态"的核心保护，单独模块化后改动时不容易误删/误改。

### 操作

新建 `auth/sessionLock.ts`：

- `globalSetSessionInProgress`、`lastGlobalSetSessionTime`、`GLOBAL_SET_SESSION_DEBOUNCE_MS`
- `canExecuteSetSession` / `acquireSetSessionLock` / `releaseSetSessionLock`（line 170-215）
- `isNetworkError`（line 233-256）

### 验收点

- Native 登录与 restoreSession 的日志（🔐 setSession…）仍然打印，行为一致

### 预计减少 ~70 行

---

## 第 3 阶段：validateSessionWithSupabase 独立成模块（中低风险，收益大）

**原理**：`validateSessionWithSupabase`（line 335-623）不依赖 React，是纯异步函数，天然适合独立模块化。搬出去后 AuthProvider 立刻少 290 行。

### 操作

新建 `auth/sessionValidation.ts`：

- `validateSessionWithSupabase`（含 `DEV_TEST_USER_ID` 常量）
- 通过 import 使用第 1、2 阶段抽出的函数

### 验收点

- 冷启动刷新页面：仍能恢复会话或正确回到未登录状态
- 网络断开时：仍保留本地登录态 + `isSessionValidated: false`

### 预计减少 ~290 行

---

## 第 4 阶段：统一登录成功后流水线（中风险，收益最大）

**原理**：4+ 处在做几乎一样的事，但各有微妙差异。需要分层设计，不能一个大函数吞掉所有差异。

### 各入口的差异分析

| 入口 | 特殊逻辑 |
|------|---------|
| `loginWithEmail` | 先 `syncUserProfileToStorage`，再从 localStorage 取名字 |
| `verifyEmailOtp` | 通过 `created_at` 判断 `isNewUser` |
| `verifyEmailOtp` (dev backdoor) | 走 `signInWithPassword`，不同步 profile |
| `onAuthStateChange` | 原生 App 里不查数据库，从 URL 推断 onboarding 状态 |
| `applyNativeLogin` | 等 `onAuthStateChange` 接管的 100ms 窗口 + 多层竞态保护 |

### 设计方案：分两层

**底层** `auth/postLoginSync.ts`（真正重复的部分）：

```ts
/**
 * 登录成功后的数据同步流水线
 * 统一处理：写 storage → 同步 profile → 绑定 analytics → 查询 onboarding
 */
export async function syncAfterLogin(options: {
  client: SupabaseClient;
  session: Session;
  userId: string;
  source: string;
}): Promise<{
  userName: string | null;
  userPicture: string | null;
  hasCompletedHabitOnboarding: boolean;
}> {
  // 1. persistSessionToStorage(session)
  // 2. syncUserProfileToStorage(client, userId)
  // 3. 计算 userName/userPicture（localStorage 优先 → user_metadata）
  // 4. bindAnalyticsUserSync(userId, email)
  // 5. fetchHabitOnboardingCompleted(client, userId, source)
  // 6. 返回结果，由调用方决定如何 setAuthState
}
```

**上层**：各入口自己处理 `setAuthState` 的特殊逻辑（因为竞态保护在每个场景不同），但调用 `syncAfterLogin` 获取统一的数据。

### 为什么不做一个 `handleSessionEstablished` 大函数？

因为 `setAuthState` 的写入逻辑在每个入口都不同：
- `loginWithEmail` 直接写
- `applyNativeLogin` 需要函数式更新 + 多层条件判断
- `onAuthStateChange` 需要先设 `isSessionValidated: false` 再异步设 `true`

把 `setAuthState` 传进去会导致参数爆炸（还要传 `inNativeApp`、各种 ref 等）。分层设计更清晰。

### 验收点

- 四种入口登录后，`userName` / `userPicture` / `hasCompletedHabitOnboarding` / `isSessionValidated` 一致
- 不会出现"密码登录有头像、OTP 没头像"的分叉行为

### 预计减少 ~150 行（去重复）

---

## 第 5 阶段：合并 Native Bridge + Auth 生命周期为 useAuthLifecycle（中高风险，最后做）

### 为什么合并而不是分开抽？

原始计划建议分成 `useNativeAuthBridge`（第 5 阶段）和 `useAuthLifecycle`（第 6 阶段）。但实际分析代码后发现，这两块共享大量 ref 状态：

```
hasHandledNativeLoginRef        — Native Bridge + restoreSession 都读
isApplyingNativeLoginRef        — Native Bridge + restoreSession + onAuthStateChange 都读
lastNativeLoginStartedAtRef     — applyNativeLogin 写, restoreSession 读
nativeAuthBootstrapDeadlineRef  — Native Bridge 写, restoreSession + navigateToLogin 读
isOnAuthStateChangeProcessingRef — applyNativeLogin 写, restoreSession + onAuthStateChange 读写
setSessionTriggeredAuthChangeRef — applyNativeLogin 读, onAuthStateChange 写
sessionCheckMutexRef            — triggerSessionCheckNow 读写
lastSessionCheckTimeRef         — triggerSessionCheckNow 读写
```

硬拆成两个 hook，要么把所有 ref 作为参数传来传去（参数爆炸），要么搞一个 `AuthRefsContext`（增加复杂度）。不如合并。

### 操作

新建 `auth/useAuthLifecycle.ts`，包含：

1. **所有 ref 声明**（8 个 ref 统一在这里管理）
2. **applyNativeLogin / applyNativeLogout**（从 AuthProvider 搬过来）
3. **Native Bridge useEffect**（事件监听 + 兜底轮询 + 可见性恢复）
4. **restoreSession + onAuthStateChange 订阅 useEffect**
5. **triggerSessionCheckNow + 定期检查 useEffect**
6. **storage 事件监听 useEffect**

Hook 签名：

```ts
export function useAuthLifecycle(options: {
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
  checkLoginState: () => { isLoggedIn: boolean; userId: string | null; sessionToken: string | null };
  logout: () => Promise<void>;
  navigateToLogin: (redirectPath?: string) => void; // 由 AuthProvider 定义，传入供消费
}): {
  triggerSessionCheckNow: (reason?: string) => Promise<void>;
}
```

> **设计决策：`navigateToLogin` 保留在 AuthProvider，不由 hook 返回**
>
> `navigateToLogin` 依赖 `useNavigate()`（React Router hook）和 `loginPathRef` / `defaultRedirectRef`（props 透传），
> 这些是路由层的东西。如果让 `useAuthLifecycle` 返回 `navigateToLogin`，hook 就会耦合 React Router。
>
> 更干净的做法：AuthProvider 定义 `navigateToLogin`，作为参数传给 `useAuthLifecycle`。
> hook 只在 `restoreSession` 等流程内消费它，不负责创建。
>
> 注意：`navigateToLogin` 内部读取 `nativeAuthBootstrapDeadlineRef` 等 ref。
> 这些 ref 由 `useAuthLifecycle` 管理。解决办法是 hook 返回这些 ref 供 `navigateToLogin` 闭包捕获，
> 或者让 `navigateToLogin` 在 hook 内部定义后通过 ref 回传给 AuthProvider。
> 具体实现时再根据代码结构选择最简洁的方案。

### 执行策略

**先整段搬，不做逻辑优化**。等验证稳定后再考虑精简。

### 验收点

- 冷启动恢复、token 刷新、登出、跨 tab 同步、定期检查，都正常
- iOS WebView：setSession 互斥和防抖仍生效（不出现 `refresh_token_already_used`）
- Native 登录事件仍能触发
- `visibilitychange` 恢复逻辑仍工作

### 预计减少 ~800 行

---

## 预期最终结构

```
src/context/
├── AuthContextDefinition.ts      # 类型定义（不动）
├── AuthContext.tsx                # ~300-400 行，只负责：
│   │                              #   - state 声明
│   │                              #   - 组合 hooks
│   │                              #   - 登录/注册方法（调用 syncAfterLogin）
│   │                              #   - 暴露 context value
│   └── auth/
│       ├── storage.ts             # localStorage 读写 + LOGGED_OUT_STATE
│       ├── sessionLock.ts         # setSession 互斥锁 + isNetworkError
│       ├── sessionValidation.ts   # validateSessionWithSupabase
│       ├── postLoginSync.ts       # 登录成功后数据同步流水线
│       ├── useAuthLifecycle.ts    # Native Bridge + Session 恢复 + 定期检查 + storage 监听
│       ├── analyticsSync.ts       # （已有）
│       ├── oauthCallback.ts       # （已有）
│       ├── userProfile.ts         # （已有）
│       ├── nativeAuthBridge.ts    # （已有）工具函数
│       └── habitOnboarding.ts     # （已有）

src/types/
└── mindboat-native.d.ts           # Window / Event 全局类型声明
```

---

## 执行优先级总结

| 阶段 | 风险 | 收益 | 预计减少行数 | 依赖 |
|------|------|------|-------------|------|
| 0. 回归清单 | 无 | 保命 | 0 | 无 |
| 1. storage + 类型搬家 | 零 | 中 | ~230 | 无 |
| 2. sessionLock | 低 | 中 | ~70 | 阶段 1 |
| 3. sessionValidation | 中低 | 高 | ~290 | 阶段 1+2 |
| 4. postLoginSync | 中 | **最高** | ~150 | 阶段 1 |
| 5. useAuthLifecycle | 中高 | 高 | ~800 | 阶段 1+2+3+4 |
| **合计** | | | **~1540** | |

最终 AuthContext.tsx 从 2344 行 → ~800 行（含已抽离模块后进一步降到 ~300-400 行）。

---

## 附录：关联优化项（不混入主重构流程）

以下问题在审查中发现，但不属于 AuthContext 重构范围，单独记录以免遗忘。

### A. `ensureUserProfileExists` 重复造轮子

| 位置 | 类型 |
|------|------|
| `src/context/auth/userProfile.ts:18` | 导出函数，接收 `(supabase, user)` |
| `src/remindMe/services/reminderService.ts:76` | 局部函数，接收 `(user)`，内部用模块级 `supabase` |

两份代码逻辑相同：查询 `public.users` 表是否存在该用户，不存在则 insert。
`reminderService.ts` 应该直接 import `userProfile.ts` 的导出版本，删除自己的重复实现。

> 如果做第 4 阶段（postLoginSync），可以考虑将 `ensureUserProfileExists` 纳入登录后流水线，
> 统一在登录成功后确保 `public.users` 记录存在，而不是散落在各处按需调用。
