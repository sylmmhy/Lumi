---
name: product-context
description: 核心产品逻辑。当涉及 Onboarding、AI 集成、记忆系统等核心功能时自动加载。
---

# 核心产品逻辑

## 1. Onboarding 流程（新手引导）

**文件参考**：`src/hooks/useOnboardingFlow.ts`

Onboarding 必须严格遵守以下状态流转：

```
welcome → running → working → completed
```

| 状态 | 说明 |
|------|------|
| **welcome** | 欢迎页，用户输入或语音输入任务 |
| **running** | AI 连接阶段，初始化 Gemini Live，进行语音交互 |
| **working** | 专注工作阶段，倒计时开始，AI 保持静默或辅助 |
| **completed** | 结算阶段，触发 `success` 或 `failure` |

**关键规则**：
- 任何修改都不能破坏这个状态机的顺序
- 必须处理 Gemini 的连接 (`isConnecting`) 和错误 (`uiError`) 状态

---

## 2. Gemini AI 集成

**文件参考**：
- `src/hooks/useGeminiLive.ts`
- `src/hooks/useAICoachSession.ts`
- `src/hooks/useVirtualMessages.ts`

**规则**：
- **严禁**在 UI 组件中直接调用 Gemini API
- 必须使用封装好的 Hooks (`useGeminiLive` 或 `useAICoachSession`)
- 必须处理 **VAD（语音活动检测）**，确保用户说话时 AI 不会抢话
- 必须使用 `useVirtualMessages` 管理系统对 AI 的隐藏指令

---

## 3. APP 主页面（AppTabsPage）

**文件参考**：`src/pages/AppTabsPage.tsx`

- **路由驱动视图**：Tab 切换通过 URL 参数控制（`/app/home`, `/app/urgency`），不是组件内部 state
- **Urgency View**：核心功能入口，点击 Start 必须复用 `useAICoachSession` 逻辑

---

## 4. 记忆系统（Memory System）

**完整文档**：`docs/architecture/memory-system.md`

**核心概念**：让 AI 教练理解用户的行为模式和偏好，提供个性化陪伴。

**记忆标签分类（6 种）**：

| 标签 | 含义 | 加载策略 |
|------|------|---------|
| **PREF** | AI 交互偏好 | **始终加载** |
| **PROC** | 拖延原因 | 按任务上下文 |
| **SOMA** | 身心反应 | 按任务上下文 |
| **EMO** | 情绪触发 | 按任务上下文 |
| **SAB** | 自我妨碍 | 按任务上下文 |
| **EFFECTIVE** | 有效激励方式 | **始终加载** |

**工作流程**：
```
用户对话 → AI 提取 → 生成 Embedding → 去重合并 → 存储 → 注入 AI 系统指令
```

**关键文件**：
- 后端 API：`supabase/functions/memory-extractor/index.ts`
- 系统指令：`supabase/functions/get-system-instruction/index.ts`
- 前端展示：`src/components/profile/MemoriesSection.tsx`

**关键规则**：
- 记忆在 `useAICoachSession` 的 `saveSessionMemory()` 中自动保存
- 向量相似度 > 0.85 视为重复，会自动合并

---

## 5. 核心组件速查

### 业务视图（`src/components/app-tabs/`）
- `BottomNavBar`：底部导航栏
- `HomeView`：首页任务列表
- `UrgencyView`：核心功能入口
- `StatsView`：数据统计
- `ProfileView`：个人资料

### 核心体验
- `TaskWorkingView`（`src/components/task/`）：AI 陪伴工作界面
- `CelebrationView`（`src/components/celebration/`）：任务完成庆祝

### 核心 Hooks（`src/hooks/`）
- `useAICoachSession`：**核心 Hook**，封装完整业务逻辑
- `useGeminiLive`：底层 AI 连接
- `useVirtualMessages`：AI 静默消息逻辑
