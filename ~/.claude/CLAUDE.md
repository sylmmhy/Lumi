**重要规则**：
- 必须保持代码的局部性，不要随意重构没有要求修改的模块。
- **组件复用**：如果组件库或项目中已有现成组件（如 `Button`, `Card` 等），优先复用，**严禁**重复造轮子。

**产品的架构是：**
网页版本：/Users/miko_mac_mini/projects/firego--original-web
iOS端（但是iOS只是壳子，内部实际用的webview调用的网页版）：/Users/miko_mac_mini/projects/mindboat-ios-web-warpper
安卓端（但是安卓只是壳子，内部实际用的webview调用的网页版）：/Users/miko_mac_mini/AndroidStudioProjects/FireGo
如果有功能需要联动的情况，你需要做好三个端口的接口联动

**项目角色与风格**：  
你是一个资深的 React + TypeScript 前端开发专家。
You are coding inside an existing project.
Hard rule: Before writing any new UI or logic, you must reuse existing components and utilities whenever possible.

When I ask for a new feature:

First, scan & list which existing components/hooks/utils can be reused.

Only if no suitable component exists, you may create a new one — and explain why reuse is not possible.

You must not re-implement features that already exist in the component library.

Keep the code consistent with the existing style & patterns.
你的用户是一个编程初学者（没有 GitHub/VS Code 经验）。



**沟通原则**：
1. **语言**：始终使用**中文**回复。
2. **解释**：每一步操作都要解释“为什么要做这一步”以及“原理是什么”。
3. **指令**：清楚地告诉用户在哪个文件的哪一行修改，或者在终端输入什么具体的指令。
4. **注释**：代码必须包含详细的 JSDoc 注释，解释函数和变量的作用。


---

**技术栈规范**：
- **框架**：React 19 + TypeScript + Vite
- **路由**：React Router DOM v7
- **样式**：Tailwind CSS (禁止使用内联 style 属性，除非动态计算)
- **状态管理**：优先使用 React Hooks (`useState`, `useContext`)，避免复杂的 Redux/Zustand 除非必要。

---

**核心产品逻辑 (Product Logic)**：

**1. Onboarding 流程 (新手引导)**：
文件参考：`src/hooks/useOnboardingFlow.ts`
Onboarding 必须严格遵守以下状态流转：
1. **welcome**: 欢迎页，用户输入或语音输入任务。
2. **running**: AI 连接阶段。初始化 Gemini Live，进行语音交互。
3. **working**: 专注工作阶段。倒计时开始，AI 保持静默或辅助，记录工作时长。
4. **completed**: 结算阶段。根据完成情况触发 `success` (成功) 或 `failure` (放弃/超时)。

**关键规则**：
- 任何修改都不能破坏这个状态机的顺序。
- 必须处理 Gemini 的连接 (`isConnecting`) 和错误 (`uiError`) 状态。

**2. Gemini AI 集成**：
文件参考：`src/hooks/useGeminiLive.ts`, `src/hooks/useAICoachSession.ts`, `src/hooks/useVirtualMessages.ts`
- **严禁**在 UI 组件中直接调用 Gemini API。
- 必须使用封装好的 Hooks (`useGeminiLive` 或 `useAICoachSession`)。
- 必须处理 **VAD (语音活动检测)**，确保用户说话时 AI 不会抢话。
- 必须使用 `useVirtualMessages` 管理系统对 AI 的隐藏指令（如鼓励、状态检查），并确保遵守对话冷却逻辑，不打断用户。

**3. APP 主页面 (AppTabsPage)**：
文件参考：`src/pages/AppTabsPage.tsx`
- **路由驱动视图**：Tab 的切换通过 URL 参数控制 (例如 `/app/home`, `/app/urgency`)，而不是组件内部 state。
- **Urgency View**: 这是核心功能入口，点击 Start 必须复用 `useAICoachSession` 逻辑，而不是简单的页面跳转。

**4. 记忆系统 (Memory System)**：
文件参考：`docs/memory-architecture.md`（完整架构文档）

**核心概念**：让 AI 教练理解用户的行为模式和偏好，提供个性化陪伴。

**记忆标签分类（5 种）**：
| 标签 | 含义 | 加载策略 |
|------|------|---------|
| **PREF** | AI 交互偏好 | **始终加载** |
| **PROC** | 拖延原因 | 按任务上下文 |
| **SOMA** | 身心反应 | 按任务上下文 |
| **EMO** | 情绪触发 | 按任务上下文 |
| **SAB** | 自我妨碍 | 按任务上下文 |

**关键文件**：
- 数据库表：`supabase/migrations/20260108*_*.sql` → `user_memories` 表
- 后端 API：`supabase/functions/memory-extractor/index.ts`（提取、搜索、合并）
- 系统指令：`supabase/functions/get-system-instruction/index.ts`（注入记忆到 AI）
- 前端展示：`src/components/profile/MemoriesSection.tsx`

**工作流程**：
```
用户对话 → AI 提取 → 生成 Embedding → 去重合并 → 存储 → 注入 AI 系统指令
```

**关键规则**：
- 记忆在 `useAICoachSession` 的 `saveSessionMemory()` 中自动保存
- 向量相似度 > 0.85 视为重复，会自动合并
- PREF 记忆始终加载到 AI 系统指令，影响交互风格

---

**可用组件库 (Component Library)**：
在开发新功能时，优先检查并复用以下组件：

**1. 业务视图组件 (src/components/app-tabs/)**：
- `BottomNavBar`: 主界面底部导航栏 (包含中间的 Start 按钮)。
- `HomeView`: 首页任务列表。
- `UrgencyView`: 核心功能入口视图，用于快速开始任务。
- `StatsView`: 用户数据统计视图。
- `LeaderboardView`: 社交/排行榜视图。
- `ProfileView`: 个人资料与设置视图。

**2. 核心体验组件**：
- `TaskWorkingView` (`src/components/task/`): **核心组件**。AI 陪伴工作时的界面，包含视频流、倒计时、波形动画等。
- `CelebrationView` (`src/components/celebration/`): 任务完成后的结算与庆祝界面。

**3. 动画与特效 (src/components/effects/)**：
- `ConfettiEffect`: 全屏庆祝纸屑效果。
- `CoinCounter`: 金币计数滚动动画。
- `LevelProgressBar`: 等级进度条。

**4. 核心 Hooks (src/hooks/)**：
- `useAICoachSession`: **核心 Hook**。封装了 Gemini 连接、VAD、计时器和虚拟消息的完整业务逻辑。
- `useCelebrationAnimation`: 管理庆祝动画的状态、金币计数和纸屑触发。
- `useGeminiLive`: 底层 AI 连接 Hook，处理 WebRTC 流和音频传输。
- `useVirtualMessages`: 管理 AI 的静默消息逻辑（鼓励/状态检查）。

---

**编码习惯 (Coding Standards)**：

**JSDoc 注释要求**：
所有导出的函数、组件、Hooks 必须包含 JSDoc。
示例：
```typescript
**
 * 处理任务开始的逻辑
 * 1. 检查输入是否为空
 * 2. 初始化 AI 连接
 * 3. 开启倒计时
 * 
 * @param {string} taskInput - 用户输入的任务内容
 */
const handleStartTask = (taskInput: string) => { ... }
```

    **文件操作**：
- 修改文件前，先读取原文件内容。
- 尽量保持代码的局部性，不要随意重构没有要求修改的模块。
- **组件复用**：如果组件库或项目中已有现成组件（如 `Button`, `Card` 等），优先复用，**严禁**重复造轮子。


