# AuthContext 重构实现记录

**完成日期**: 2026-02-06
**分支**: dev
**用户故事**: US-001 ~ US-018

## 背景

`AuthContext.tsx` 从项目初期逐步累积到 2344 行，成为一个包含 20+ 个函数、15+ 个 useEffect、大量 localStorage 操作的单体模块。任何认证相关的修改都需要理解整个文件，增加了维护成本和出错风险。

## 目标

将 2344 行单体拆分为职责清晰的独立模块，同时：
- 保持完全相同的公共 API（`AuthContextValue` 不变）
- 不引入任何行为变更
- 建立测试安全网确保无回归

## 实施过程

### 阶段一：测试基础设施（US-001 ~ US-002）

1. 配置 Vitest + React Testing Library + jsdom
2. 编写 5 个 AuthContext 集成测试作为回归安全网

### 阶段二：纯函数提取（US-003 ~ US-011）

按依赖顺序逐个提取：

| 顺序 | 模块 | 提取内容 |
|------|------|---------|
| 1 | storage.ts | localStorage 常量、批量读取、读/写/清除 |
| 2 | sessionLock.ts | setSession 互斥锁、防抖、网络错误判断 |
| 3 | sessionValidation.ts | Supabase 会话验证（含重试机制） |
| 4 | analyticsSync.ts | Amplitude 用户标识绑定/重置 |
| 5 | nativeAuthBridge.ts | iOS/Android 原生桥接 |
| 6 | oauthCallback.ts | OAuth 回调参数解析 |
| 7 | userProfile.ts | 用户资料 CRUD |
| 8 | habitOnboarding.ts | habit onboarding 状态查询 |
| 9 | postLoginSync.ts | 登录后统一同步管道 |

每个模块提取后都运行全部测试确认无回归。

### 阶段三：Hook 提取（US-012 ~ US-014）

将 AuthContext 中的 refs、useEffect、生命周期函数移入 `useAuthLifecycle` Hook：

1. **US-012**: 提取 refs 和 applyNativeLogin/Logout
2. **US-013**: 提取 triggerSessionCheckNow 和 restoreSession useEffect
3. **US-014**: 提取 Native Bridge 事件、storage 同步、OAuth 回调等剩余生命周期

### 阶段四：测试补全（US-015）

为 `useAuthLifecycle` Hook 编写 6 个单元测试，覆盖：
- restoreSession 初始化
- onAuthStateChange SIGNED_IN/SIGNED_OUT
- triggerSessionCheckNow 会话修复
- storage 跨标签页同步
- Native Login 事件处理

### 阶段五：收尾（US-016 ~ US-018）

1. **US-016**: 消除 reminderService.ts 中重复的 `ensureUserProfileExists`
2. **US-017**: 确认所有模块 JSDoc 完整，提取 logout.ts 和 emailAuth.ts 使 AuthContext 降至 273 行
3. **US-018**: 更新架构文档（本文件）

## 最终结果

| 指标 | 重构前 | 重构后 |
|------|--------|--------|
| AuthContext.tsx 行数 | 2344 | 273 |
| 模块数量 | 1 | 14（含类型定义） |
| 测试数量 | 0 | 47 |
| 公共 API 变更 | - | 无 |

## 关键技术决策

1. **AuthContextDefinition.ts 独立**：避免类型定义和运行时代码循环依赖
2. **sessionLock 模块级全局锁**：解决 iOS WebView 恢复时并发 setSession 竞态
3. **postLoginSync 统一管道**：消除 4 处登录入口的重复同步代码
4. **useAuthLifecycle 单一 Hook**：所有 useEffect 集中管理，AuthContext 无任何 useEffect/useRef
5. **emailAuth 纯函数**：登录/注册/OTP 逻辑从 useCallback 中提取为可测试的纯函数
