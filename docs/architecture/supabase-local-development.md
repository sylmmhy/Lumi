# Supabase 本地开发环境

> 最后更新：2026-01-16

本文档描述如何设置和管理本地 Supabase 开发环境，包括版本管理、同步部署等完整工作流程。

---

## 📋 概述

为了**安全地开发和测试后端改动**，项目使用本地 Supabase 环境。这样可以：

- ✅ 避免误操作生产数据库
- ✅ 快速迭代和测试
- ✅ 类似 Git 的版本管理
- ✅ 一键同步到远端

---

## 🚀 快速开始

### 前置要求

1. **Docker Desktop** - 本地 Supabase 依赖 Docker
   - macOS: https://www.docker.com/products/docker-desktop/
   - 确保 Docker 正在运行

2. **Supabase CLI** - 安装方法：
   ```bash
   # macOS
   brew install supabase/tap/supabase

   # 或使用 npm
   npm install -g supabase
   ```

3. **登录 Supabase**（用于同步远端）：
   ```bash
   supabase login
   supabase link --project-ref <你的项目ID>
   ```

### 首次启动

```bash
# 1. 启动本地 Supabase（首次需要下载镜像，约 2-5 分钟）
npm run supabase:start

# 2. 启动前端开发服务器（自动连接本地 Supabase）
npm run dev:local

# 3. 访问 http://localhost:5173
```

### ⚠️ 完整启动（包含 Edge Functions）

**重要**：`npm run supabase:start` 只启动数据库和基础服务。如果你需要测试 **AI 功能**（如 Gemini 对话、记忆提取等），必须额外启动 Edge Functions：

```bash
# 终端 1：启动本地 Supabase 基础服务
npm run supabase:start

# 终端 2：启动 Edge Functions（热重载模式）
npm run supabase:functions

# 终端 3：启动前端
npm run dev:local
```

| 启动命令 | 提供的功能 |
|---------|-----------|
| `npm run supabase:start` | 数据库、Auth、Storage、Studio 仪表盘 |
| `npm run supabase:functions` | 所有 Edge Functions（AI、推送通知等） |

**注意**：`supabase:functions` 需要在 `supabase/.env.local` 中配置 API 密钥（见下方配置章节）。

---

## 📖 命令速查表

### 基础命令

| 命令 | 用途 | 说明 |
|------|------|------|
| `npm run supabase:start` | 启动本地服务 | 启动数据库、Auth、Storage 等基础服务 |
| `npm run supabase:functions` | 启动 Edge Functions | **需要新开终端**，热重载模式 |
| `npm run supabase:stop` | 停止本地服务 | 结束开发时执行，数据会保留 |
| `npm run supabase:status` | 查看服务状态 | 检查是否正常运行 |

### 开发命令

| 命令 | 用途 | 说明 |
|------|------|------|
| `npm run dev:local` | 本地开发 | 前端连接本地 Supabase |
| `npm run dev:remote` | 连接远端 | 前端连接生产 Supabase（谨慎使用） |
| `npm run use:local` | 切换到本地配置 | 只切换环境变量，不启动服务 |
| `npm run use:remote` | 切换到远端配置 | 只切换环境变量，不启动服务 |

### 同步部署命令

| 命令 | 用途 | 说明 |
|------|------|------|
| **`npm run supabase:sync`** | **一键同步全部** | 推送迁移 + 部署函数 |
| `npm run supabase:push` | 只推送数据库迁移 | 只改了 SQL 时使用 |
| `npm run supabase:deploy` | 只部署 Edge Functions | 只改了函数时使用 |

### 版本管理命令（类似 Git）

| 命令 | 用途 | 类似 Git |
|------|------|---------|
| `npm run supabase:snapshot "描述"` | 创建快照备份 | `git commit` |
| `npm run supabase:snapshots` | 列出所有快照 | `git log` |
| `npm run supabase:restore <名称>` | 恢复到指定快照 | `git checkout` |
| `npm run supabase:pull` | 从远程拉取 schema | `git pull` |
| `npm run supabase:reset` | 重置到初始状态 | `git reset --hard` |
| `npm run supabase:verify` | 验证本地环境 | 健康检查 |

---

## 🔄 日常开发流程

### 完整工作流

```bash
# ============================================
# 第一步：启动本地 Supabase（终端 1）
# ============================================
npm run supabase:start
# 等待所有服务启动完成（约 30 秒）

# ============================================
# 第二步：启动 Edge Functions（终端 2）
# ============================================
# ⚠️ 如果要测试 AI 功能，必须启动！
npm run supabase:functions
# 会显示 "Serving functions on http://127.0.0.1:54321/functions/v1/<function-name>"

# ============================================
# 第三步：启动前端开发（终端 3）
# ============================================
npm run dev:local
# 访问 http://localhost:5173

# ============================================
# 第四步：开始修改前，创建快照备份
# ============================================
npm run supabase:snapshot "开始改用户表"

# ============================================
# 第五步：进行后端修改
# ============================================
# - 修改数据库：编辑 supabase/migrations/ 中的 SQL 文件
# - 修改函数：编辑 supabase/functions/ 中的 TypeScript 文件
# - 在本地测试验证...

# ============================================
# 第六步：测试完成后，一键同步到远端
# ============================================
npm run supabase:sync
# 🚀 自动执行：
#   1. 推送数据库迁移 (supabase db push)
#   2. 部署所有 Edge Functions (supabase functions deploy)
# ✅ 同步完成！

# ============================================
# 收工：停止本地 Supabase
# ============================================
npm run supabase:stop
```

---

## 📸 版本管理（快照系统）

### 工作原理

快照系统使用 `pg_dump` 导出完整数据库，保存到 `supabase/snapshots/` 目录。

```
supabase/
└── snapshots/
    ├── 20260116_143000_开始改用户表.sql
    ├── 20260116_150000_添加记忆字段.sql
    └── 20260116_160000_修复通知bug.sql
```

### 使用场景

#### 场景 1：开始新功能前备份

```bash
npm run supabase:snapshot "开始改用户表之前"
# 📸 快照创建成功！
# 文件: supabase/snapshots/20260116_143000_开始改用户表之前.sql
```

#### 场景 2：改坏了，从快照恢复

```bash
# 查看有哪些快照
npm run supabase:snapshots

# 恢复到指定快照
npm run supabase:restore 20260116_143000_开始改用户表之前
# ⚠️ 警告: 这将覆盖当前本地数据库的所有数据！
# 确认恢复? (y/N): y
# ✅ 恢复成功！
```

#### 场景 3：本地完全乱了，从远程恢复

```bash
npm run supabase:pull
# ⚠️ 警告: 这将重置本地数据库到远程的 Schema 状态！
# 确认从远程拉取? (y/N): y
# ✅ 完成！本地数据库已与远程同步
```

#### 场景 4：想要一个干净的初始状态

```bash
npm run supabase:reset
# 重置到 migrations 定义的初始状态
# 所有数据会被清除
```

---

## 🌐 本地服务地址

启动本地 Supabase 后，可以访问以下地址：

| 服务 | 地址 | 用途 |
|------|------|------|
| **API (PostgREST)** | https://127.0.0.1:54321 | 前端调用的 REST API |
| **Studio (仪表盘)** | http://127.0.0.1:54323 | 可视化管理数据库、查看数据 |
| **Inbucket (邮件)** | http://127.0.0.1:54324 | 查看本地测试邮件 |
| **数据库 (PostgreSQL)** | localhost:54322 | 直接连接数据库（用户: postgres，密码: postgres） |

### Studio 仪表盘功能

访问 http://127.0.0.1:54323 可以：
- 📊 查看和编辑表数据
- 🔧 执行 SQL 查询
- 👥 管理用户认证
- 📁 管理文件存储
- ⚡ 查看 Edge Functions 日志

---

## 📁 目录结构

```
supabase/
├── config.toml          # 本地 Supabase 配置
├── .env.local           # Edge Functions 密钥（git ignored）
├── .env.local.example   # 密钥模板
├── functions/           # Edge Functions（40+ 个）
│   ├── _shared/         # 共享库
│   ├── memory-extractor/
│   ├── get-system-instruction/
│   └── ...
├── migrations/          # 数据库迁移
│   └── 00000000000000_init.sql
├── migrations_backup/   # 历史迁移备份
└── snapshots/           # 本地快照（版本管理）

scripts/
├── supabase-snapshot.sh   # 创建快照脚本
├── supabase-snapshots.sh  # 列出快照脚本
├── supabase-restore.sh    # 恢复快照脚本
└── supabase-pull.sh       # 从远程拉取脚本

# 环境变量文件
.env.supabase-local      # 本地环境配置
.env.supabase-remote     # 远端环境配置
.env.local               # 当前活跃配置（由脚本切换）
```

---

## ⚙️ 配置文件说明

### 环境变量切换

| 文件 | 用途 | Git 追踪 |
|------|------|---------|
| `.env.supabase-local` | 本地 Supabase 配置 | ✅ 是 |
| `.env.supabase-remote` | 远端 Supabase 配置 | ✅ 是 |
| `.env.local` | 当前活跃配置 | ❌ 否（由脚本覆盖） |
| `supabase/.env.local` | Edge Functions 密钥 | ❌ 否（敏感信息） |

### 本地配置内容 (`.env.supabase-local`)

```env
VITE_SUPABASE_URL=https://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGci...（本地演示密钥）
```

### Edge Functions 密钥 (`supabase/.env.local`)

复制 `supabase/.env.local.example` 并填入真实密钥：

```env
# AI 功能（必须）
GEMINI_API_KEY=your_key
AZURE_AI_API_KEY=your_key
AZURE_AI_ENDPOINT=https://xxx.openai.azure.com

# 推送通知（可选）
APNS_KEY_ID=xxx
FCM_PROJECT_ID=xxx
```

---

## ⏰ Cron Job 说明（重要！）

### 本地环境没有 Cron Job

**关键区别**：本地 Supabase **不运行 Cron Job**。生产环境的 Cron Job 由 Supabase 云端的 `pg_cron` 扩展自动执行，但本地开发时这些定时任务不会运行。

### 生产环境的 Cron Jobs

| Cron Job 名称 | 调度频率 | 功能 |
|--------------|---------|------|
| `check-task-notifications` | 每分钟 | 调用 `process_task_notifications()` 函数 |

`process_task_notifications()` 函数会执行：
1. **`ensure_upcoming_routine_instances()`** - 确保重复任务（Routine）有今天的实例
2. **`check_and_send_task_notifications()`** - 检查到期任务并发送推送通知

### 受影响的功能

如果 Cron Job 未运行（本地环境），以下功能会受影响：

| 功能 | 影响 | 本地测试替代方案 |
|------|------|-----------------|
| **📱 推送通知** | 任务到期时不会自动发送 VoIP/FCM 推送 | 手动调用 Edge Function 测试 |
| **🔄 Routine 实例生成** | 重复任务不会自动出现在今天的任务列表 | 手动调用 SQL 函数 |
| **🏝️ iOS 灵动岛** | Live Activity 不会自动更新 | 手动触发测试 |

### 本地手动触发 Cron 逻辑

如果需要在本地测试 Cron 相关功能，可以手动执行：

**方法 1：通过 Studio 执行 SQL**

访问 http://127.0.0.1:54323 → SQL Editor → 执行：

```sql
-- 生成今天的 routine 实例
SELECT * FROM generate_daily_routine_instances();

-- 或执行完整的通知检查流程
SELECT process_task_notifications();
```

**方法 2：通过命令行执行**

```bash
# 使用 psql 连接本地数据库
psql postgresql://postgres:postgres@localhost:54322/postgres -c "SELECT process_task_notifications();"
```

### 为什么本地不运行 Cron？

1. **避免干扰**：本地测试时不希望每分钟都收到推送通知
2. **节省资源**：Cron 会持续占用数据库连接
3. **精确控制**：手动触发可以更好地调试和观察行为

### 如何验证 Cron 在生产环境是否正常？

```sql
-- 在 Supabase Dashboard 的 SQL Editor 执行
SELECT * FROM get_deep_drift_cron_status();

-- 或查看 cron.job 表
SELECT jobid, schedule, command, active, jobname
FROM cron.job
WHERE jobname LIKE '%notification%' OR jobname LIKE '%routine%';
```

---

## 🐛 常见问题

### Q1: `supabase start` 失败

**可能原因**：Docker 未运行

**解决方案**：
```bash
# 检查 Docker 是否运行
docker ps

# 如果未运行，启动 Docker Desktop
open -a Docker
```

### Q2: 端口被占用

**可能原因**：其他服务占用了 54321-54327 端口

**解决方案**：
```bash
# 查看端口占用
lsof -i :54321

# 停止占用的服务，或修改 supabase/config.toml 中的端口
```

### Q3: HTTPS 证书问题

**可能原因**：本地使用自签名证书

**解决方案**（macOS）：
```bash
# 信任本地证书
security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db ~/.supabase/ssl/cert.pem
```

### Q4: Edge Functions 无法访问

**可能原因**：缺少密钥配置

**解决方案**：
1. 复制 `supabase/.env.local.example` 为 `supabase/.env.local`
2. 填入真实的 API 密钥
3. 重启 Supabase: `npm run supabase:stop && npm run supabase:start`

### Q5: 从远程拉取后数据丢失

**这是预期行为**：`supabase:pull` 只拉取 schema 结构，不拉取数据。

如需测试数据，可以：
1. 创建 `supabase/seed.sql` 添加测试数据
2. 运行 `npm run supabase:reset` 自动填充

### Q6: Gemini Token 返回 404（本地能启动但 AI 功能失败）

**症状**：
- 本地 Supabase 正常运行
- 登录成功
- 但启动 AI 对话时报错：`Failed to get token from Google: 404`

**原因**：
Google 已**废弃**旧的 `generateToken` REST API 端点。

| 对比 | 旧方式（已废弃） | 新方式（当前） |
|------|-----------------|---------------|
| API | `POST /v1beta/models/xxx:generateToken` | SDK `authTokens.create()` |
| 返回格式 | `{ ephemeralToken: "..." }` | `{ name: "auth_tokens/...", expireTime, newSessionExpireTime }` |
| 状态 | ❌ 返回 404 | ✅ 正常工作 |

**解决方案**：

确保 `supabase/functions/gemini-token/index.ts` 使用新的 SDK 方式：

```typescript
// ❌ 旧方式（已废弃）
const tokenResponse = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateToken?key=${apiKey}`,
  { method: 'POST', body: JSON.stringify({ ttlSeconds: ttl }) }
);

// ✅ 新方式（使用 SDK）
import { GoogleGenAI } from "npm:@google/genai@^1.0.0";
const client = new GoogleGenAI({ apiKey });
const tokenResponse = await client.authTokens.create({
  config: {
    uses: 1,
    expireTime: new Date(Date.now() + ttl * 1000).toISOString(),
    newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
    httpOptions: { apiVersion: 'v1alpha' },
  },
});
return { token: tokenResponse.name, ... };
```

更新代码后，重启 Edge Functions：`npm run supabase:functions`

### Q7: 本地数据库表数量不对（只有几个表）

**症状**：
- 本地 Supabase 启动成功
- 但 Studio 只显示 5 个表，远端有 20+ 个
- 记忆系统、通知系统等功能无法使用

**原因**：
迁移文件命名问题。Supabase CLI 会**跳过**文件名包含 `init` 的迁移文件。

```
❌ 00000000000000_init.sql    → 被跳过
✅ 00000000000000_schema.sql  → 正常执行
```

**诊断方法**：

```bash
# 检查迁移状态
supabase migration list

# 如果 Local 列全是空的，说明没有应用任何迁移
```

**解决方案**：

```bash
# 1. 如果迁移文件名是 xxx_init.sql，重命名为 xxx_schema.sql
mv supabase/migrations/00000000000000_init.sql supabase/migrations/00000000000000_schema.sql

# 2. 完全清除并重启
supabase stop --no-backup
docker volume ls --filter label=com.supabase.cli.project=firego-local -q | xargs -r docker volume rm
supabase start
```

### Q8: 迁移失败 - 缺少 pgvector 扩展

**错误信息**：
```
ERROR: type "vector" does not exist
```

**原因**：
schema.sql 中使用了 `vector(1536)` 类型（用于记忆系统的向量搜索），但没有先创建 pgvector 扩展。

**解决方案**：
在 `supabase/migrations/00000000000000_schema.sql` 文件**开头**添加：

```sql
-- 启用 pgvector 扩展（用于记忆系统的向量搜索）
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";
```

### Q9: 迁移失败 - 缺少 admin_user 角色

**错误信息**：
```
ERROR: role "admin_user" does not exist
```

**原因**：
schema.sql 中有 `GRANT ... TO admin_user` 语句，但 admin_user 角色只在生产环境存在。

**解决方案**：
在 `supabase/migrations/00000000000000_schema.sql` 的 CREATE EXTENSION 语句后添加：

```sql
-- 创建 admin_user 角色（如果不存在）
DO $
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'admin_user') THEN
    CREATE ROLE "admin_user" NOLOGIN;
  END IF;
END
$;
```

### Q10: seed.sql 执行失败 - 列名不匹配

**错误信息**：
```
ERROR: column "memory_text" of relation "user_memories" does not exist
```

**原因**：
seed.sql 中的测试数据使用了旧的列名，和当前表结构不匹配。

| 旧列名（seed.sql 中） | 新列名（实际表结构） |
|---------------------|---------------------|
| `memory_text` | `content` |
| `memory_tag` | `tag` |
| `source_task_name` | `task_name` |

**解决方案**：

方法 1：临时禁用 seed（推荐）

```bash
# 编辑 supabase/config.toml
[db.seed]
enabled = false  # 改为 false
```

方法 2：修复 seed.sql 中的列名

```sql
-- 修改 INSERT INTO user_memories 语句
INSERT INTO public.user_memories (
    id,
    user_id,
    content,      -- 原来是 memory_text
    tag,          -- 原来是 memory_tag
    task_name,    -- 原来是 source_task_name
    created_at
) VALUES ...
```

---

## ⚠️ 迁移文件维护规则（重要！）

### 为什么会出现这些问题？

本项目的迁移文件采用了**合并策略**：把远端 90+ 个迁移文件合并成一个 `00000000000000_schema.sql`。

**好处**：
- 本地启动快（只执行一个文件）
- 避免迁移历史冲突

**坏处**：
- 如果远端 schema 变化，需要手动同步
- 某些扩展/角色需要手动添加

### 何时需要更新 schema.sql？

当远端数据库有以下变化时：
1. 新增/修改表结构
2. 新增/修改函数
3. 新增/修改触发器
4. 新增扩展

### 如何安全地更新 schema.sql？

```bash
# 1. 从远端拉取最新 schema
supabase db pull --linked

# 2. 检查拉取的文件
ls supabase/migrations/

# 3. 如果生成了新的迁移文件，需要：
#    - 合并到 00000000000000_schema.sql
#    - 确保扩展和角色创建语句在文件开头
#    - 删除临时迁移文件

# 4. 测试
supabase stop --no-backup
supabase start
```

### 迁移文件命名规范

| 规则 | 示例 | 说明 |
|------|------|------|
| ✅ 使用 `_schema` 后缀 | `00000000000000_schema.sql` | 主 schema 文件 |
| ❌ 避免 `_init` 后缀 | `00000000000000_init.sql` | **会被跳过！** |
| ✅ 时间戳命名 | `20260116120000_add_feature.sql` | 增量迁移 |

---

## 🔗 相关文档

- [部署指南](../dev-guide/deployment.md) - 如何部署到生产环境
- [记忆系统](./memory-system.md) - AI 记忆系统架构
- [关键决策](../KEY_DECISIONS.md) - 技术决策记录
