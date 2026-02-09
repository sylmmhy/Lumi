## 🚀 快速参考（必读）

| 规则 | 说明 |
|------|------|
| **禁止猜测 Bug** | 必须有 log、报错信息或数据库记录作为证据 |
| **禁止重复造轮子** | 先查现有函数和迁移，优先复用 |
| **🚨 禁止乱加表格** | 新功能**优先扩展现有表**，不要随意新建表增加系统复杂性 |
| **先理解再动手** | 写新后端功能前，**必须先搞清楚现有系统的运行原理和逻辑** |
| **中文回复** | 始终用中文，解释原理和操作步骤 |
| **保持局部性** | 不要随意重构没有要求修改的模块 |
| **搜索网上资料** | Bug 排查和技术调研必须先 WebSearch |
| **Supabase 操作** | 支持本地/云端模式，使用 `/debuglocal` 或 `/debugremote` 切换 |

---

## 📁 项目结构

**这是 Lumi 项目的后端仓库**。

### 仓库分离说明

| 仓库 | GitHub | 本地路径 | 说明 |
|------|--------|---------|------|
| **后端（当前）** | [sylmmhy/Lumi-supabase](https://github.com/sylmmhy/Lumi-supabase.git) | 当前目录 | Supabase：迁移、Edge Functions |
| **前端** | [sylmmhy/Lumi](https://github.com/sylmmhy/Lumi.git) | `../Lumi-front-end` | React + TypeScript + Vite |

> **历史背景**：两个仓库原本是同一个 repo，为了 hackathon 方便进行了分 repo 处理。部分配置和规则在两个仓库中相互引用。
>
> **本地目录约定**：两个仓库应放在同一父目录下，即 `Lumi-front-end/` 和 `Lumi-backend/` 是兄弟目录。

### 当前仓库结构（后端）

```
Lumi-supabase/
├── package.json          # npm 脚本（supabase:start 等）
├── scripts/              # 辅助脚本
├── docs/                 # 文档
└── supabase/             # Supabase 项目目录（标准结构）
    ├── config.toml           # Supabase 项目配置
    ├── .env.local            # 本地环境变量（不提交）
    ├── .env.local.example    # 环境变量模板
    ├── migrations/           # 数据库迁移文件（SQL）
    │   ├── 00000000000000_schema.sql      # 基础 schema
    │   └── 20260129*.sql                  # 按时间戳命名的迁移
    ├── functions/            # Edge Functions（TypeScript/Deno）
    │   ├── _shared/          # 共享模块
    │   ├── memory-extractor/ # 记忆提取
    │   ├── retrieve-memories/# 记忆检索
    │   ├── seagull-chat/     # AI 对话
    │   └── ...（40+ 个函数）
    └── seed.sql              # 种子数据
```

### 前端仓库结构（供参考）

```
Lumi-front-end/
├── src/
│   ├── components/       # React 组件
│   ├── hooks/            # Hooks（useGeminiLive, useAICoachSession）
│   └── pages/            # 页面
├── docs/                 # 共享文档（架构、实现记录）
└── public/               # 静态资源
```

### 跨仓库操作

```bash
# 查看前端仓库
ls ../Lumi-front-end/

# 在前端仓库执行 git 操作
git -C ../Lumi-front-end status

# 前端文档目录（两个仓库共用文档规范）
ls ../Lumi-front-end/docs/
```

---

## 🛠️ Skills / Subagents / Hooks 索引

### Skills（按需自动加载）

| Skill | 路径 | 触发场景 |
|-------|------|---------|
| **launch** | `.claude/skills/launch/SKILL.md` | 说 `/launch`，将 dev 同步到 master 发布 |
| **debugremote** | `.claude/skills/debugremote/SKILL.md` | 说 `/debugremote`，切换到云端 Supabase 调试模式（MCP 直接操作） |
| **debuglocal** | `.claude/skills/debuglocal/SKILL.md` | 说 `/debuglocal`，恢复本地 Supabase 优先原则 |
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

## 📚 文档维护系统

### 本仓库文档（后端）

```
docs/
└── supabase-local-development.md  # Supabase 本地开发完整指南
```

### 前端仓库文档（共享）

```
../Lumi-front-end/docs/
├── in-progress/          # 进行中的实现（必须实时更新）
├── implementation-log/   # 已完成的实现记录
├── architecture/         # 架构文档（含记忆系统等）
├── dev-guide/           # 开发/部署指南
└── KEY_DECISIONS.md     # 关键技术决策
```

**详细规则见**：`.claude/skills/doc-maintenance/SKILL.md`

---

## 🔧 常用命令（后端）

```bash
# 本地 Supabase 服务
npm run supabase:start          # 启动本地 Supabase
npm run supabase:stop           # 停止本地 Supabase
npm run supabase:status         # 查看服务状态

# 数据库迁移
npm run supabase:push:local     # 应用迁移到本地
npm run supabase:reset          # 重置本地数据库

# Edge Functions（需要新开终端）
npm run supabase:functions      # 本地运行函数（热重载）

# 数据库查询
npm run db:query "SELECT * FROM users LIMIT 10;"
```

> **完整文档**：`docs/supabase-local-development.md`

### 前端命令（在 `../Lumi-front-end` 执行）

```bash
npm run dev      # 启动开发服务器
npm run build    # 构建生产版本
npm run lint     # 代码检查
```

---

## 🗄️ Supabase 操作模式
使用 Supabase MCP 时，始终使用配置中的正确项目 ID=ivlfsixvfovqitkajyjc

> **支持两种模式**：本地开发模式（本地 Docker 容器）和云端调试模式（直接操作云端数据库）。
> 根据上下文和对话判断当前使用哪种模式，使用 `/debuglocal` 或 `/debugremote` 切换。

### ✅ 已授权的云端操作

| 操作 | 工具/命令 | 说明 |
|------|----------|------|
| **数据库查询/修改** | `mcp__supabase__execute_sql` | 直接执行 SQL |
| **查看表结构** | `mcp__supabase__list_tables` | 查看云端表 |
| **查看日志** | `mcp__supabase__get_logs` | 查看 Edge Function 日志 |
| **部署函数** | `npx supabase functions deploy` | 部署到云端 |
| **推送迁移** | `npx supabase db push` | 推送到云端数据库 |

### 📋 云端操作注意事项

- **备份重要数据**：云端操作是实时生效的
- **谨慎删除操作**：DELETE/DROP 等操作无法撤销
- **测试后再改结构**：ALTER TABLE 等结构变更要先验证

### 🔄 模式切换

- **切换到本地模式**：使用 `/debuglocal` 命令（适合本地开发、测试迁移）
- **切换到云端模式**：使用 `/debugremote` 命令（适合快速调试、查看生产数据）

---

## ⚠️ 重要规则

### 后端开发原则（禁止乱加表格）

> **核心原则：先理解现有系统，再决定如何实现。优先扩展现有表，避免增加系统复杂性。**

#### 为什么不能随意新建表？

- 每新增一张表，就增加了：关联查询复杂度、迁移维护成本、RLS 策略配置、Edge Function 的调用逻辑
- 很多时候，**在现有表上加几个字段**就能解决问题，比新建表简单得多

#### 正确流程

1. **先搞清楚现有系统怎么运行的**
   - 读相关的迁移文件（`supabase/migrations/`）
   - 读相关的 Edge Function 代码
   - 理解数据流：前端调用 → Edge Function → 数据库操作 → 返回结果

2. **评估是否需要新表**
   - ❌ 错误思路："这个功能需要存数据，我建个新表吧"
   - ✅ 正确思路："现有的 `xxx` 表能不能加几个字段来支持这个功能？"

3. **如果确实需要新表**
   - 必须解释为什么现有表无法扩展
   - 说明新表与现有表的关系（外键、关联）

#### 示例

| 场景 | ❌ 错误做法 | ✅ 正确做法 |
|------|-----------|-----------|
| 给用户加个"偏好设置" | 新建 `user_preferences` 表 | 在 `profiles` 表加 `preferences JSONB` 字段 |
| 记录目标的子任务 | 新建 `goal_subtasks` 表 | 先看 `goals` 表是否能用 `subtasks JSONB` 字段 |
| 新功能需要存状态 | 直接新建表 | 先查现有表结构，找最相关的表扩展 |

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

> 前端相关逻辑见前端仓库 `../Lumi-front-end/`

### 后端核心功能

#### 1. 记忆系统（本仓库重点）

**相关文件**：
- `migrations/20260127100000_tolan_memory_system.sql` - 记忆表结构
- `migrations/20260127120000_tiered_memory_search.sql` - 分层检索
- `functions/memory-extractor/` - 记忆提取 Edge Function
- `functions/retrieve-memories/` - 记忆检索 Edge Function
- `functions/memory-compressor/` - 记忆压缩

**记忆标签分类（6 种）**：
| 标签 | 含义 | 加载策略 |
|------|------|---------|
| **PREF** | AI 交互偏好 | **始终加载** |
| **PROC** | 拖延原因 | 按任务上下文 |
| **SOMA** | 身心反应 | 按任务上下文 |
| **EMO** | 情绪触发 | 按任务上下文 |
| **SAB** | 自我妨碍 | 按任务上下文 |
| **EFFECTIVE** | 有效激励方式 | **始终加载** |

#### 2. 目标系统

**相关文件**：
- `migrations/20260129110000_create_goals_tables.sql` - 目标表结构
- `migrations/20260129140000_goal_memory_integration.sql` - 目标记忆集成
- `functions/daily-goal-adjustment/` - 每日目标调整

#### 3. AI 对话

**相关文件**：
- `functions/seagull-chat/` - 主对话函数
- `functions/get-system-instruction/` - 系统提示词生成
- `functions/_shared/` - 共享模块（Dify、ElevenLabs 等）

**详细信息见**：`.claude/skills/product-context/SKILL.md`

---

## 📦 可复用的后端模块

### 共享模块 (`functions/_shared/`)
- `dify.ts` - Dify AI 对话集成
- `elevenlabs.ts` - ElevenLabs 语音合成
- `transcription.ts` - 语音转文字
- `voice.ts` - 语音处理工具
- `http.ts` - HTTP 请求工具

### 核心 Edge Functions
- `seagull-chat/` - AI 对话主函数
- `memory-extractor/` - 记忆提取
- `retrieve-memories/` - 记忆检索
- `get-system-instruction/` - 系统提示词

> **前端组件库**见前端仓库 `../Lumi-front-end/` 的 CLAUDE.md

---

## 👤 用户与沟通原则

**你的用户是编程初学者**（没有 GitHub/VS Code 经验）

1. **语言**：始终使用**中文**回复
2. **解释**：每一步操作都要解释"为什么要做这一步"以及"原理是什么"
3. **指令**：清楚地告诉用户在哪个文件的哪一行修改
4. **注释**：代码必须包含详细的 JSDoc 注释

---

## 📐 技术栈与代码规范

### 后端（本仓库）
- **平台**：Supabase（PostgreSQL + Edge Functions）
- **Edge Functions**：TypeScript + Deno 运行时
- **数据库**：PostgreSQL + pgvector（向量搜索）
- **AI 集成**：Dify、ElevenLabs、Google Gemini

### 前端（`../Lumi-front-end/`）
- **框架**：React 19 + TypeScript + Vite
- **路由**：React Router DOM v7
- **样式**：Tailwind CSS

### 通用规范
- **Git**：遵循 Conventional Commits，中文描述
- **注释**：所有导出的函数必须包含 JSDoc 注释
