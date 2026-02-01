## 🚀 快速参考（必读）

| 规则 | 说明 |
|------|------|
| **禁止猜测 Bug** | 必须有 log、报错信息或数据库记录作为证据 |
| **禁止重复造轮子** | 先查组件库，优先复用现有组件 |
| **中文回复** | 始终用中文，解释原理和操作步骤 |
| **保持局部性** | 不要随意重构没有要求修改的模块 |
| **搜索网上资料** | Bug 排查和技术调研必须先 WebSearch |
| **Supabase 仅限本地** | ⛔ 所有后端改动**只能**在本地 Supabase 进行，**严禁**未授权修改云端 |

---

## 🛠️ Skills / Subagents / Hooks 索引

### Skills（按需自动加载）

| Skill | 路径 | 触发场景 |
|-------|------|---------|
| **commit** | `.claude/skills/commit/SKILL.md` | 说 `/commit`，自动修复 lint 并提交代码 |
| **launch** | `.claude/skills/launch/SKILL.md` | 说 `/launch`，将 dev 同步到 master 发布 |
| **debug-workflow** | `.claude/skills/debug-workflow/SKILL.md` | Bug 排查、调试、遇到错误时 |
| **tech-research** | `.claude/skills/tech-research/SKILL.md` | 评估新技术/功能可行性时 |
| **doc-maintenance** | `.claude/skills/doc-maintenance/SKILL.md` | 进行复杂实现、完成功能、更新文档时 |
| **product-context** | `.claude/skills/product-context/SKILL.md` | 涉及 Onboarding、AI 集成、记忆系统时 |

### Subagents（手动触发）

| Subagent | 路径 | 触发方式 |
|----------|------|---------|
| **code-reviewer** | `.claude/agents/code-reviewer.md` | 说"帮我审查代码" |
| **log-analyzer** | `.claude/agents/log-analyzer.md` | 说"分析日志" |

### Hooks（自动执行）

| Hook | 触发时机 | 作用 |
|------|---------|------|
| `PostToolUse (Edit\|Write)` | 每次编辑/写入文件后 | 自动运行 `npm run lint` |
| `PreToolUse (git push)` | 推送代码前 | 自动代码审查 |
| `commit-msg` (husky) | git commit 时 | commitlint 检查格式 |

---

## 🗂️ 项目仓库架构

**背景**：本项目原为单一仓库，为了 Hackathon 方便进行了前后端分离。

### 仓库架构（四端）

| 端 | 仓库 | 相对路径 | 说明 |
|------|------|---------|------|
| **网页版（当前）** | Lumi-front-end | `.`（当前目录） | React + TypeScript + Vite |
| **后端** | Lumi-backend | `../Lumi-backend` | Supabase：迁移、Edge Functions |
| **iOS 端** | mindboat-ios-web-warpper | `../mindboat-ios-web-warpper` | WebView 壳子，Swift |
| **Android 端** | Android-warpper | `../Android-warpper` | WebView 壳子，Kotlin |

> **目录结构**：
> ```
> 父目录/                         # 如 "Lumi hackthon"
> ├── Lumi-front-end/             # 前端仓库（当前仓库）
> ├── Lumi-backend/               # 后端仓库
> ├── mindboat-ios-web-warpper/   # iOS 仓库
> └── Android-warpper/            # Android 仓库
> ```
> 四个仓库在同一父目录下，使用相对路径互相访问。

### 跨仓库操作命令

```bash
# 查看后端仓库（假设与前端在同一父目录）
ls ../Lumi-backend/

# 在后端仓库执行 git 操作
git -C ../Lumi-backend status

# 查看后端迁移文件
ls ../Lumi-backend/supabase/migrations/
```

### 仓库关联说明

- 两个仓库原本是**同一个 repo**，部分文件和规则存在相互引用
- 后端仓库包含：Supabase 迁移文件、Edge Functions、RPC 函数
- 前端通过 `src/lib/supabase.ts` 连接后端 API

### 前端项目目录结构

```
Lumi-front-end/
├── .claude/              # Claude Code 配置（skills、agents、hooks）
├── docs/                 # 项目文档（架构、实现记录）
├── public/               # 静态资源（图片、图标）
├── scripts/              # 构建/检查脚本
├── src/
│   ├── assets/           # 前端资源（图片、字体）
│   ├── components/       # React 组件
│   │   ├── ai/           # AI 相关组件（TalkingFire）
│   │   ├── app-tabs/     # 主 Tab 页视图（Home, Stats, Profile）
│   │   ├── celebration/  # 任务完成庆祝视图
│   │   ├── common/       # 通用组件
│   │   ├── effects/      # 动效组件（Confetti, LevelBar）
│   │   ├── feedback/     # 反馈组件
│   │   ├── landing/      # 落地页组件
│   │   ├── modals/       # 弹窗组件
│   │   ├── onboarding/   # Onboarding 组件
│   │   ├── task/         # 任务执行视图
│   │   └── ui/           # UI 基础组件
│   ├── constants/        # 常量定义
│   ├── context/          # React Context（Auth 等）
│   ├── hooks/            # 自定义 Hooks
│   │   └── gemini-live/  # Gemini Live API 封装
│   ├── lib/              # 工具库（supabase, i18n, amplitude）
│   ├── locales/          # 国际化翻译文件
│   ├── pages/            # 页面组件
│   │   └── onboarding/   # Onboarding 页面
│   ├── remindMe/         # 提醒功能模块
│   ├── styles/           # 样式文件
│   ├── types/            # TypeScript 类型定义
│   └── utils/            # 工具函数
├── CLAUDE.md             # Claude Code 项目指令（当前文件）
├── package.json          # 依赖配置
└── vite.config.ts        # Vite 构建配置
```

---

## 🏗️ 跨仓库协作架构

**重要**：本产品有三端，经常需要跨仓库修改。

| 端 | 仓库路径 | 说明 |
|------|---------|------|
| **网页版** | 当前仓库 (`Lumi-front-end`) | 主代码库，React + TypeScript |
| **iOS 端** | `../mindboat-ios-web-warpper` | WebView 壳子，Swift |
| **Android 端** | `../Android-warpper` | WebView 壳子，Kotlin |

### 跨端联动场景

| 场景 | 需要修改的仓库 |
|------|--------------|
| JS Bridge 接口变更 | 三端都要改 |
| 新增原生功能（推送、音频） | iOS + Android |
| 纯 Web UI/逻辑改动 | 仅前端（Lumi-front-end） |
| Deep Link / URL Scheme | 三端都要改 |

### 跨仓库操作命令

```bash
# 查看 iOS 仓库
ls ../mindboat-ios-web-warpper/

# 查看 Android 仓库
ls ../Android-warpper/

# 在其他仓库执行 git 操作
git -C ../mindboat-ios-web-warpper status
git -C ../Android-warpper status
```

---

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

**详细规则见**：`.claude/skills/doc-maintenance/SKILL.md`

---

## 🔧 常用命令

```bash
npm run dev          # 启动开发服务器（使用当前 .env.local 配置）
npm run dev:local    # 连接本地 Supabase 开发
npm run dev:remote   # 连接远程 Supabase 开发
npm run build        # 构建生产版本
npm run lint         # 代码检查
```

---

## 🔄 前后端分离开发流程

### 仓库说明

| 仓库 | 路径 | 说明 |
|------|------|------|
| **前端（当前）** | `Lumi-front-end/` | React 前端 |
| **后端** | `../Lumi-backend/` | Supabase 后端（迁移、Edge Functions） |

### 切换 Supabase 环境

| 命令 | 连接目标 | 适用场景 |
|------|---------|---------|
| `npm run dev:local` | 本地 Supabase (`127.0.0.1:54321`) | 开发新功能、调试后端 |
| `npm run dev:remote` | 云端 Supabase | 只改前端、测试生产数据 |

### 完整本地开发流程（推荐）

```bash
# ============================================
# 终端 1：启动后端（在 Lumi-backend 目录）
# ============================================
cd ../Lumi-backend
npm run supabase:start       # 启动 Supabase 服务
npm run supabase:functions   # 启动 Edge Functions（AI 功能需要）

# ============================================
# 终端 2：启动前端（在 Lumi-front-end 目录）
# ============================================
cd ../Lumi-front-end
npm run dev:local            # 自动切换到本地配置并启动

# 访问 http://localhost:5173
```

### 仅前端开发流程（不需要后端改动）

```bash
# 直接连接远程 Supabase，无需启动本地服务
npm run dev:remote
```

### 环境配置文件

| 文件 | 作用 | Git 追踪 |
|------|------|---------|
| `.env.supabase-local` | 本地 Supabase 配置 | ✅ 是 |
| `.env.supabase-remote` | 远程 Supabase 配置 | ✅ 是 |
| `.env.local` | 当前生效配置 | ❌ 否（由脚本生成） |

**原理**：`npm run dev:local` 会执行 `cp .env.supabase-local .env.local && vite`

---

## 🗄️ Supabase 本地开发

> ⛔ **强制规则**：任何涉及后端的改动，都**只能**在本地 Supabase 进行（仓库路径：`../Lumi-backend/`）。
> **严禁**在用户未明确授权的情况下修改云端 Supabase！

### ⛔ 云端部署安全规则（强制）

| 规则 | 说明 |
|------|------|
| **仅限本地开发** | 所有 Supabase 代码（迁移、Edge Functions、RPC）**只能**在本地环境开发和测试 |
| **严禁未授权云端操作** | **严禁**在未经用户明确授权的情况下，对云端 Supabase 进行任何读写操作 |
| **本地验证必须通过** | 必须先在本地验证通过后，再请求用户授权部署到云端 |

**🚫 绝对禁止的操作**（除非用户**明确说**"部署到云端"）：
- `npx supabase db push`（不带 `--local`）→ 会推送到云端 ❌
- `npx supabase functions deploy` → 会部署到云端 ❌
- `npx supabase migrations push` → 会推送到云端 ❌
- 任何不带 `--local` 标志的 Supabase CLI 命令 ❌

**✅ 正确流程**：
1. 在 `../Lumi-backend/` 仓库中进行所有后端改动
2. 使用 `--local` 标志在本地开发和测试
3. 验证功能正常
4. **主动询问用户**："本地测试通过，是否需要部署到云端？"
5. **只有**获得用户明确授权后，才能执行云端部署命令

### 本地数据库更改必须持久化

**重要**：直接在本地数据库执行的 SQL（如 `docker exec` 或 Supabase Studio）在 `supabase db reset` 后会丢失！

| 更改类型 | 必须创建迁移文件 | 示例 |
|---------|----------------|------|
| 新增/修改表结构 | ✅ 是 | `ALTER TABLE`, `CREATE TABLE` |
| 新增/修改 RPC 函数 | ✅ 是 | `CREATE FUNCTION` |
| 新增/修改索引 | ✅ 是 | `CREATE INDEX` |
| 新增/修改约束 | ✅ 是 | `ALTER TABLE ADD CONSTRAINT` |
| 插入测试数据 | ❌ 否 | `INSERT INTO` |

### 正确流程

```bash
# 1. 创建迁移文件（文件名格式：YYYYMMDDHHMMSS_描述.sql）
touch supabase/migrations/20260127100000_add_new_feature.sql

# 2. 编写 SQL 并应用到本地
npx supabase db push --local

# 3. 验证更改
docker exec supabase_db_firego-local psql -U postgres -d postgres -c "你的查询"
```

### 常用本地数据库命令

```bash
# 查看本地数据库
docker exec supabase_db_firego-local psql -U postgres -d postgres -c "SELECT * FROM your_table LIMIT 10;"

# 重启 Edge Functions（代码更改后）
npx supabase functions serve --env-file supabase/.env.local

# 重置本地数据库（会重新应用所有迁移）
npx supabase db reset --local
```

---

## ⚠️ 重要规则

### Bug 排查原则（严禁猜测）

- **严禁**凭直觉或经验随意猜测 Bug 原因
- **必须**找到实际的 log、报错信息、或数据库记录作为证据
- 如果现有代码没有相关日志，**必须先添加测试 log**（如 `console.log`），复现问题后再分析
- 解释原因时，**用产品经理能听懂的话**说清楚：
  - ❌ 错误示范："可能是 useEffect 的依赖数组导致重复渲染"
  - ✅ 正确示范："问题是：用户点击按钮后，页面刷新了两次。原因是：代码在'用户登录成功'和'页面加载完成'时都触发了跳转，导致跳了两次。证据是：控制台显示 `handleRedirect` 被调用了 2 次（附 log 截图）。"

### Bug 排查必须搜索网上资料

- **原因**：AI 模型的训练数据不是最新的，很多新版本的 API 变更、已知 bug、社区解决方案可能不在训练数据中
- **必须**使用 WebSearch 搜索：官方文档、GitHub Issues、Stack Overflow
- **搜索关键词**：`[库名] + [版本号] + [错误信息或症状]`
- **优先采纳**：官方推荐 > 高赞社区方案 > 自己摸索

### 技术可行性调研

- **目的**：在开始实现前，识别可能无法解决的技术障碍
- **输出格式**：
  ```
  ✅ 可行：[官方支持的功能点]
  ⚠️ 风险：[有已知 bug 但有 workaround 的点]
  ❌ 不可行：[官方不支持 / 至今无解的点]
  ```

**详细流程见**：`.claude/skills/debug-workflow/SKILL.md` 和 `.claude/skills/tech-research/SKILL.md`

---

## 🎯 核心产品逻辑

### 1. Onboarding 流程

文件参考：`src/hooks/useOnboardingFlow.ts`

状态流转：`welcome → running → working → completed`

| 状态 | 说明 |
|------|------|
| **welcome** | 欢迎页，用户输入或语音输入任务 |
| **running** | AI 连接阶段，初始化 Gemini Live |
| **working** | 专注工作阶段，倒计时开始 |
| **completed** | 结算阶段，触发 success 或 failure |

**关键规则**：任何修改都不能破坏这个状态机的顺序。

### 2. Gemini AI 集成

文件参考：`src/hooks/useGeminiLive.ts`, `src/hooks/useAICoachSession.ts`, `src/hooks/useVirtualMessages.ts`

- **严禁**在 UI 组件中直接调用 Gemini API
- 必须使用封装好的 Hooks（`useGeminiLive` 或 `useAICoachSession`）
- 必须处理 **VAD（语音活动检测）**，确保用户说话时 AI 不会抢话

### 3. 记忆系统

完整文档：`docs/architecture/memory-system.md`

**记忆标签分类（6 种）**：
| 标签 | 含义 | 加载策略 |
|------|------|---------|
| **PREF** | AI 交互偏好 | **始终加载** |
| **PROC** | 拖延原因 | 按任务上下文 |
| **SOMA** | 身心反应 | 按任务上下文 |
| **EMO** | 情绪触发 | 按任务上下文 |
| **SAB** | 自我妨碍 | 按任务上下文 |
| **EFFECTIVE** | 有效激励方式 | **始终加载** |

**详细信息见**：`.claude/skills/product-context/SKILL.md`

---

## 📦 可用组件库

在开发新功能时，优先检查并复用以下组件：

### 业务视图组件 (`src/components/app-tabs/`)
- `BottomNavBar`: 底部导航栏
- `HomeView`: 首页任务列表
- `UrgencyView`: 核心功能入口
- `StatsView`: 数据统计视图
- `ProfileView`: 个人资料视图

### 核心体验组件
- `TaskWorkingView` (`src/components/task/`): AI 陪伴工作界面
- `CelebrationView` (`src/components/celebration/`): 任务完成庆祝界面

### 核心 Hooks (`src/hooks/`)
- `useAICoachSession`: **核心 Hook**，封装完整业务逻辑
- `useGeminiLive`: 底层 AI 连接
- `useVirtualMessages`: AI 静默消息逻辑
- `useCelebrationAnimation`: 庆祝动画状态

---

## 👤 用户与沟通原则

**你的用户是编程初学者**（没有 GitHub/VS Code 经验）

1. **语言**：始终使用**中文**回复
2. **解释**：每一步操作都要解释"为什么要做这一步"以及"原理是什么"
3. **指令**：清楚地告诉用户在哪个文件的哪一行修改
4. **注释**：代码必须包含详细的 JSDoc 注释

---

## 📐 技术栈与代码规范

- **框架**：React 19 + TypeScript + Vite
- **路由**：React Router DOM v7
- **样式**：Tailwind CSS（禁止内联 style，除非动态计算）
- **状态管理**：优先使用 React Hooks（`useState`, `useContext`）
- **Git**：遵循 Conventional Commits，中文描述（由 commitlint 自动检查）
- **JSDoc**：所有导出的函数、组件、Hooks 必须包含 JSDoc 注释
