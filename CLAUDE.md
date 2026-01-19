## 📚 文档维护系统

### 目录结构

```
docs/
├── in-progress/          # 进行中的实现（必须实时更新）
│   └── _TEMPLATE.md      # 实现文档模板
├── implementation-log/   # 已完成的实现记录（扁平结构）
├── architecture/         # 架构文档（必须保持最新）
├── dev-guide/           # 开发/部署指南
└── KEY_DECISIONS.md     # 关键技术决策
```

| 目录 | 用途 | 更新策略 |
|------|------|---------|
| `in-progress/` | 进行中的实现 | **实时更新**，完成后迁移 |
| `implementation-log/` | 已完成的实现记录 | 完成时创建，不再更新 |
| `architecture/` | 系统架构文档 | 架构变化时更新 |
| `dev-guide/` | 开发/部署指南 | 工具变化时更新 |
| `KEY_DECISIONS.md` | 关键技术决策 | 做出决策时追加 |

### Claude Code 文档维护规则

**规则 1：开始复杂实现时**
当开始涉及多个文件或新功能的实现时：
1. 在 `docs/in-progress/` 创建 `YYYYMMDD-功能名.md`
2. 复制 `_TEMPLATE.md` 内容，填写 front matter
3. **实现过程中持续更新**进度和记录

**规则 2：实现过程中**
每次有重要进展时：
1. 更新 front matter 中的 `updated` 时间
2. 更新 `stage` 状态
3. 在「实现记录」章节追加当日进展
4. 保持记录**精简**（禁止大段代码）

**规则 3：实现完成后**
当功能全部完成并验证通过时：
1. 将文档从 `in-progress/` 移动到 `implementation-log/`
2. 更新 `stage` 为 `✅ 完成`
3. 更新 `architecture/` 中相关文档（如果涉及架构）
4. 如有重大决策，追加到 `KEY_DECISIONS.md`

**规则 4：读取 in-progress/ 时**
自动检查：
- front matter `updated` 超过 3 天 → 提醒更新
- front matter `due` 已过期 → 提醒处理

### 命名规范

- `in-progress/`: `YYYYMMDD-功能名称.md`（YYYYMMDD 为开始日期）
- `implementation-log/`: `YYYYMMDD-功能名称.md`（扁平结构，按日期排序）
- `architecture/`: `模块名.md` 或 `模块名-system.md`
- `dev-guide/`: `动作名.md`（如 setup.md, deployment.md）

### 精简原则

实现记录必须精简：
- ✅ 关键决策和原因
- ✅ 问题和解决方案
- ✅ 文件路径引用（如 `src/hooks/useX.ts:42`）
- ✅ 简短代码片段（<20行）
- ❌ 禁止大段复制代码
- ❌ 禁止冗长调试日志

---

**🔍 代码审查规则**：

说"帮我审查代码"触发 `code-reviewer` subagent，检查清单见 `.claude/agents/code-reviewer.md`

---

**重要规则**：
- 必须保持代码的局部性，不要随意重构没有要求修改的模块。
- **组件复用**：如果组件库或项目中已有现成组件（如 `Button`, `Card` 等），优先复用，**严禁**重复造轮子。
- **Bug 排查原则（严禁猜测）**：
  - **严禁**凭直觉或经验随意猜测 Bug 原因。
  - **必须**找到实际的 log、报错信息、或数据库记录作为证据。
  - 如果现有代码没有相关日志，**必须先添加测试 log**（如 `console.log`），复现问题后再分析。
  - 解释原因时，**用产品经理能听懂的话**说清楚：
    - ❌ 错误示范："可能是 useEffect 的依赖数组导致重复渲染"
    - ✅ 正确示范："问题是：用户点击按钮后，页面刷新了两次。原因是：代码在'用户登录成功'和'页面加载完成'时都触发了跳转，导致跳了两次。证据是：控制台显示 `handleRedirect` 被调用了 2 次（附 log 截图）。"
- **Bug 反复修不好时**：
  - **必须**先用 `git log --grep="关键词"` 查看历史修复记录
  - 总结之前尝试过的方向
  - 然后问自己：
    - 之前的修复都是在同一个方向上打转吗？
    - 现有代码的 API / 方案选型，有没有可能一开始就选错了？
    - 如果从零实现这个功能，主流做法是什么？和我们的有什么不同？

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
文件参考：`docs/architecture/memory-system.md`（完整架构文档）

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

**关键文件**：
- 数据库表：`supabase/migrations/20260108*_*.sql`、`20260109*_*.sql` → `user_memories` 表
- 任务成功元数据：`supabase/migrations/20260108210000_add_success_metadata_to_tasks.sql`
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
- PREF 和 EFFECTIVE 记忆始终加载到 AI 系统指令，影响交互风格和激励策略

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


