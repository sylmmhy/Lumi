# PRD: AuthContext.tsx 重构

## Introduction

AuthContext.tsx 是 Lumi 应用的核心认证模块，当前膨胀至 2344 行，包含 localStorage 管理、会话验证、Native Bridge 通信、登录流程等多种职责混杂在一个文件中。登录成功后的数据同步流水线在 4+ 处近乎重复，已登出状态字面量出现 4 次，8 个 ref 在多个 useEffect 间交叉引用。

本次重构将该文件拆分为 6 个独立模块 + 1 个全局类型声明文件，最终将 AuthContext.tsx 从 2344 行缩减至 ~300-400 行。重构遵循"先搬家不改逻辑，对外 API 不变，每步可验证"的原则，同时编写自动化测试覆盖关键路径，修复潜在竞态问题，并为后续新增登录方式奠定基础。

## Goals

- 将 AuthContext.tsx 从 2344 行缩减至 ~300-400 行，提升可维护性
- 消除 4+ 处重复的登录成功后流水线代码
- 消除 4 处重复的已登出状态字面量
- 将 localStorage 操作、会话锁、会话验证、登录同步、生命周期管理独立为可测试模块
- 为每个抽离模块编写单元测试，覆盖关键路径和竞态场景
- 保持 `AuthContextValue` 接口和 `AuthProvider` 导出不变，对消费方零影响
- 清理关联的重复代码（`ensureUserProfileExists`）
- 为后续新增登录方式（如 Apple Sign-In、Google One-Tap）提供清晰的扩展点

## User Stories

### US-001: 建立回归测试基准
**Description:** 作为开发者，我需要在重构前建立自动化测试基准，确保重构过程中不引入回归 bug。

**Acceptance Criteria:**
- [ ] 为 AuthContext 现有行为编写集成测试，覆盖以下场景：
  - Web 密码登录 → 登出 → 刷新页面后保持登录
  - Web OTP 登录 → 验证码登录 → 登出
  - OAuth 回调（带 code / access_token）能登录成功，URL 参数被清理
  - 多标签页同步：A 标签页登出，B 标签页跟随
- [ ] 测试框架配置完成（Vitest + React Testing Library）
- [ ] `npm run test` 能运行并全部通过
- [ ] Typecheck 通过：`npm run build`

### US-002: 抽离 storage 工具模块
**Description:** 作为开发者，我需要将 localStorage 相关的常量和读写函数集中到 `auth/storage.ts`，这样修改存储逻辑时只需改一个文件。

**Acceptance Criteria:**
- [ ] 新建 `src/context/auth/storage.ts`，包含：
  - `AUTH_STORAGE_KEYS` 常量
  - `NATIVE_LOGIN_FLAG_KEY` 常量
  - `batchGetLocalStorage` 函数
  - `readAuthFromStorage` 函数
  - `persistSessionToStorage` 函数
  - `clearAuthStorage` 函数
  - `LOGGED_OUT_STATE` 常量（消除 4 处重复的已登出状态字面量）
- [ ] AuthContext.tsx 中对应代码删除，改为 import
- [ ] `logout`、`fullReset`、`SIGNED_OUT` 事件、`validateSessionWithSupabase` 中的登出状态改用 `{ ...LOGGED_OUT_STATE }`
- [ ] 为 `storage.ts` 编写单元测试（localStorage mock）
- [ ] Lint 通过：`npm run lint`
- [ ] Build 通过：`npm run build`
- [ ] 回归测试全部通过

### US-003: 移动全局类型声明
**Description:** 作为开发者，我需要将 `declare global` 类型声明移到专用的 `.d.ts` 文件，使 AuthContext.tsx 只包含业务逻辑。

**Acceptance Criteria:**
- [ ] 新建 `src/types/mindboat-native.d.ts`
- [ ] 将 AuthContext.tsx 中 `declare global` 块（Window 接口 + DocumentEventMap）迁移过去
- [ ] 使用 `import()` 类型引用（不写顶层 import），确保全局声明生效
- [ ] 文件末尾有 `export {};`
- [ ] AuthContext.tsx 中删除原 `declare global` 块（~90 行）
- [ ] Typecheck 通过：`npm run build`
- [ ] 回归测试全部通过

### US-004: 抽离 setSession 互斥锁模块
**Description:** 作为开发者，我需要将 refresh token 竞态保护逻辑独立为 `auth/sessionLock.ts`，使并发控制逻辑集中管理、不易误删。

**Acceptance Criteria:**
- [ ] 新建 `src/context/auth/sessionLock.ts`，包含：
  - `globalSetSessionInProgress`、`lastGlobalSetSessionTime`、`GLOBAL_SET_SESSION_DEBOUNCE_MS`
  - `canExecuteSetSession` / `acquireSetSessionLock` / `releaseSetSessionLock`
  - `isNetworkError` 函数
- [ ] AuthContext.tsx 中对应代码删除，改为 import
- [ ] 为 `sessionLock.ts` 编写单元测试，覆盖：
  - 互斥锁获取/释放
  - debounce 时间窗口内的拒绝
  - 各类网络错误的判断
- [ ] Native 登录与 restoreSession 日志（🔐 setSession…）仍正常打印
- [ ] Lint + Build 通过
- [ ] 回归测试全部通过

### US-005: 抽离 validateSessionWithSupabase 模块
**Description:** 作为开发者，我需要将 `validateSessionWithSupabase`（~290 行纯异步函数）独立为 `auth/sessionValidation.ts`，这是最大的单函数，独立后 AuthProvider 立刻减少 290 行。

**Acceptance Criteria:**
- [ ] 新建 `src/context/auth/sessionValidation.ts`，包含：
  - `validateSessionWithSupabase` 函数
  - `DEV_TEST_USER_ID` 常量
  - 通过 import 使用 `storage.ts` 和 `sessionLock.ts` 的函数
- [ ] AuthContext.tsx 中对应代码删除，改为 import
- [ ] 为 `sessionValidation.ts` 编写单元测试，覆盖：
  - 有效 session 的验证成功路径
  - 过期 session 的刷新路径
  - 网络断开时保留本地登录态 + `isSessionValidated: false`
  - 无 session 时返回 `LOGGED_OUT_STATE`
- [ ] 冷启动刷新页面能恢复会话或回到未登录状态
- [ ] Lint + Build 通过
- [ ] 回归测试全部通过

### US-006: 统一登录成功后流水线
**Description:** 作为开发者，我需要将 4+ 处重复的登录后同步逻辑抽取为 `auth/postLoginSync.ts` 的 `syncAfterLogin` 函数，消除代码重复。

**Acceptance Criteria:**
- [ ] 新建 `src/context/auth/postLoginSync.ts`，导出 `syncAfterLogin` 函数
- [ ] `syncAfterLogin` 封装统一流程：persistSessionToStorage → syncUserProfileToStorage → 计算 userName/userPicture → bindAnalyticsUserSync → fetchHabitOnboardingCompleted
- [ ] `syncAfterLogin` 返回 `{ userName, userPicture, hasCompletedHabitOnboarding }`，由调用方自行 `setAuthState`
- [ ] 以下入口改为调用 `syncAfterLogin`：
  - `loginWithEmail`
  - `verifyEmailOtp`（含 dev backdoor）
  - `onAuthStateChange`
  - `applyNativeLogin`
- [ ] 各入口的特殊逻辑（isNewUser 判断、竞态保护、函数式更新）保留在各自位置
- [ ] 为 `postLoginSync.ts` 编写单元测试
- [ ] 四种入口登录后 `userName`/`userPicture`/`hasCompletedHabitOnboarding`/`isSessionValidated` 一致
- [ ] Lint + Build 通过
- [ ] 回归测试全部通过

### US-007: 合并 Native Bridge + Auth 生命周期为 useAuthLifecycle
**Description:** 作为开发者，我需要将 Native Bridge 事件处理、session 恢复、定期检查、storage 监听合并为 `auth/useAuthLifecycle.ts`，这是最大的一步（~800 行），完成后 AuthProvider 缩减到目标大小。

**Acceptance Criteria:**
- [ ] 新建 `src/context/auth/useAuthLifecycle.ts`，包含：
  - 所有 8 个 ref 声明（统一管理）
  - `applyNativeLogin` / `applyNativeLogout`
  - Native Bridge useEffect（事件监听 + 兜底轮询 + 可见性恢复）
  - `restoreSession` + `onAuthStateChange` 订阅 useEffect
  - `triggerSessionCheckNow` + 定期检查 useEffect
  - storage 事件监听 useEffect
- [ ] Hook 接收 `{ setAuthState, checkLoginState, logout, navigateToLogin }` 参数
- [ ] Hook 返回 `{ triggerSessionCheckNow }`
- [ ] AuthContext.tsx 缩减到 ~300-400 行，只负责 state 声明 + 组合 hooks + 登录/注册方法 + 暴露 context value
- [ ] 为 `useAuthLifecycle.ts` 编写测试，覆盖：
  - 冷启动恢复会话
  - token 刷新
  - 跨 tab 同步
  - Native 登录事件触发
  - `visibilitychange` 恢复逻辑
  - setSession 互斥和防抖（不出现 `refresh_token_already_used`）
- [ ] Lint + Build 通过
- [ ] 回归测试全部通过

### US-008: 清理 ensureUserProfileExists 重复实现
**Description:** 作为开发者，我需要消除 `ensureUserProfileExists` 的重复定义，统一使用 `auth/userProfile.ts` 的导出版本。

**Acceptance Criteria:**
- [ ] `src/remindMe/services/reminderService.ts` 中删除局部的 `ensureUserProfileExists`
- [ ] 改为 import `src/context/auth/userProfile.ts` 的导出版本
- [ ] 调用处适配参数（传入 supabase client）
- [ ] 为 `ensureUserProfileExists` 补充单元测试
- [ ] Lint + Build 通过
- [ ] 回归测试全部通过

### US-009: 最终验证与文档更新
**Description:** 作为开发者，我需要在全部重构完成后进行完整验证，并更新架构文档。

**Acceptance Criteria:**
- [ ] AuthContext.tsx 最终行数 <= 400 行
- [ ] 所有新建模块都有 JSDoc 注释
- [ ] 全部自动化测试通过
- [ ] `npm run lint` + `npm run build` 通过
- [ ] 手动回归测试通过（Web 密码/OTP 登录、OAuth 回调、多标签页同步、Native WebView）
- [ ] `docs/architecture/` 中更新 AuthContext 架构文档，反映新的模块结构
- [ ] `docs/implementation-log/` 中创建重构实现记录

## Functional Requirements

- FR-1: 新建 `src/context/auth/storage.ts`，集中 localStorage 常量和读写函数，导出 `LOGGED_OUT_STATE` 统一常量
- FR-2: 新建 `src/types/mindboat-native.d.ts`，承载 Window / DocumentEventMap 全局类型声明
- FR-3: 新建 `src/context/auth/sessionLock.ts`，封装 setSession 互斥锁和网络错误判断
- FR-4: 新建 `src/context/auth/sessionValidation.ts`，独立 `validateSessionWithSupabase` 纯异步函数
- FR-5: 新建 `src/context/auth/postLoginSync.ts`，导出 `syncAfterLogin` 统一登录后数据同步流水线
- FR-6: 新建 `src/context/auth/useAuthLifecycle.ts`，合并 Native Bridge + session 恢复 + 定期检查 + storage 监听
- FR-7: `ensureUserProfileExists` 统一为 `auth/userProfile.ts` 的导出版本，删除 `reminderService.ts` 中的重复实现
- FR-8: `AuthContextValue` 接口形状和 `AuthProvider` 导出保持不变，对消费方零影响
- FR-9: `LOGGED_OUT_STATE` 使用时必须展开写 `{ ...LOGGED_OUT_STATE }`，不直接传引用
- FR-10: `useAuthLifecycle` 接收 `{ setAuthState, checkLoginState, logout, navigateToLogin }` 参数，返回 `{ triggerSessionCheckNow }`
- FR-11: `syncAfterLogin` 只返回数据结果，不调用 `setAuthState`，由各入口自行处理状态更新
- FR-12: 所有新模块必须有 JSDoc 注释

## Non-Goals

- 不修改 `AuthContextDefinition.ts` 中的类型接口定义
- 不新增或修改登录方式（如 Apple Sign-In）
- 不修改 Supabase 后端、Edge Functions 或数据库 schema
- 不重构 Onboarding 流程或 Gemini AI 集成相关代码
- 不优化 `useAuthLifecycle` 内部的竞态逻辑（先搬家，后续再优化）
- 不修改 iOS/Android WebView 端的代码

## Design Considerations

- 重构为纯"搬家"操作，不改变现有 UI 或用户交互
- 无 UI 变更，不需要设计稿
- 模块划分遵循"按职责分离"原则，每个文件有单一明确职责

## Technical Considerations

### 依赖关系

```
阶段 1 (storage + types) ← 无依赖
阶段 2 (sessionLock)     ← 依赖阶段 1
阶段 3 (sessionValidation) ← 依赖阶段 1 + 2
阶段 4 (postLoginSync)   ← 依赖阶段 1
阶段 5 (useAuthLifecycle) ← 依赖阶段 1 + 2 + 3 + 4
```

### 风险点

- **阶段 5（useAuthLifecycle）风险最高**：涉及 8 个交叉引用的 ref、iOS WebView 时序保护、并发控制。必须严格"先整段搬，不做逻辑优化"
- **`.d.ts` 文件的 import 陷阱**：顶层 import 会让 `declare global` 失效，必须使用 `import()` 类型引用
- **`LOGGED_OUT_STATE` 引用安全**：必须展开写，避免对象引用被意外修改

### 测试策略

- 使用 Vitest + React Testing Library
- 纯函数模块（storage、sessionLock、sessionValidation、postLoginSync）使用单元测试
- Hook 模块（useAuthLifecycle）使用 `renderHook` 测试
- AuthProvider 集成测试覆盖完整登录/登出/恢复流程
- Mock Supabase client、localStorage、Native Bridge 事件

### 最终文件结构

```
src/context/
├── AuthContextDefinition.ts      # 类型定义（不动）
├── AuthContext.tsx                # ~300-400 行
└── auth/
    ├── storage.ts                # localStorage 读写 + LOGGED_OUT_STATE
    ├── sessionLock.ts            # setSession 互斥锁 + isNetworkError
    ├── sessionValidation.ts      # validateSessionWithSupabase
    ├── postLoginSync.ts          # 登录成功后数据同步流水线
    ├── useAuthLifecycle.ts       # Native Bridge + Session 恢复 + 定期检查
    ├── analyticsSync.ts          # （已有）
    ├── oauthCallback.ts          # （已有）
    ├── userProfile.ts            # （已有）
    ├── nativeAuthBridge.ts       # （已有）
    └── habitOnboarding.ts        # （已有）

src/types/
└── mindboat-native.d.ts          # Window / Event 全局类型声明
```

## Success Metrics

- AuthContext.tsx 最终行数 <= 400 行（从 2344 行缩减 ~83%）
- 所有新模块有对应的单元测试文件，测试覆盖率 > 80%
- `npm run lint` + `npm run build` + `npm run test` 全部通过
- 对外 API（`AuthContextValue`）零变更，消费方无需任何修改
- 手动回归清单 5 项全部通过
- 重复代码（登录后流水线、登出状态字面量）消除为单一来源

## Open Questions

- 是否需要为 `useAuthLifecycle` 的 8 个 ref 引入一个 `AuthRefsType` 类型，提升类型安全？
- `navigateToLogin` 的传递方式：通过参数传入 vs 在 hook 内部定义后通过 ref 回传，哪种更简洁需要实现时决定
- 是否需要在 `postLoginSync.ts` 中统一调用 `ensureUserProfileExists`，还是保持现有的分散调用模式？
- 测试框架是否已配置 Vitest？如未配置，需要在 US-001 中额外处理初始化
