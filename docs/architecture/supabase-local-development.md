# Supabase 本地开发环境

> 最后更新：2026-01-28

本文档描述前后端分离后，如何设置和管理本地 Supabase 开发环境。

---

## 📋 概述

项目已进行**前后端分离**，Supabase 后端代码移至独立仓库。

### 仓库结构

| 仓库 | 路径 | 说明 |
|------|------|------|
| **前端（当前）** | `Lumi/` | React + TypeScript + Vite |
| **后端** | `../Lumi-supabase/` | Supabase：迁移、Edge Functions |

> 两个仓库应放在同一父目录下，即 `Lumi/` 和 `Lumi-supabase/` 是兄弟目录。

---

## 🚀 快速开始

### 前置要求

1. **Docker Desktop** - 本地 Supabase 依赖 Docker
2. **Supabase CLI** - `brew install supabase/tap/supabase`
3. **两个仓库都已 clone** - 放在同一父目录下

### 首次启动

```bash
# ============================================
# 终端 1：启动后端（在 Lumi-supabase 目录）
# ============================================
cd ../Lumi-supabase
npm run supabase:start       # 启动 Supabase 服务
npm run supabase:functions   # 启动 Edge Functions（AI 功能需要）

# ============================================
# 终端 2：启动前端（在 Lumi 目录）
# ============================================
cd ../Lumi
npm run dev:local            # 连接本地 Supabase
# 访问 http://localhost:5173
```

---

## 🔄 切换 Supabase 环境

### 前端命令（在 `Lumi/` 目录执行）

| 命令 | 连接目标 | 适用场景 |
|------|---------|---------|
| `npm run dev:local` | 本地 Supabase (`127.0.0.1:54321`) | 开发新功能、调试后端 |
| `npm run dev:remote` | 云端 Supabase（生产环境） | 只改前端、测试生产数据 |

### 仅切换环境（不启动开发服务器）

| 命令 | 作用 |
|------|------|
| `npm run use:local` | 切换到本地配置 |
| `npm run use:remote` | 切换到远程配置 |

### 环境配置文件

| 文件 | 作用 | Git 追踪 |
|------|------|---------|
| `.env.supabase-local` | 本地 Supabase 配置 | ✅ 是 |
| `.env.supabase-remote` | 远程 Supabase 配置 | ✅ 是 |
| `.env.local` | 当前生效配置 | ❌ 否（由脚本生成） |

**原理**：`npm run dev:local` 执行 `cp .env.supabase-local .env.local && vite`

---

## 📖 命令速查表

### 前端命令（在 `Lumi/` 执行）

| 命令 | 用途 |
|------|------|
| `npm run dev:local` | 连接本地 Supabase 开发 |
| `npm run dev:remote` | 连接远程 Supabase 开发 |
| `npm run build` | 构建生产版本 |

### 后端命令（在 `../Lumi-supabase/` 执行）

| 命令 | 用途 |
|------|------|
| `npm run supabase:start` | 启动本地 Supabase 服务 |
| `npm run supabase:stop` | 停止本地服务 |
| `npm run supabase:status` | 查看服务状态 |
| `npm run supabase:functions` | 启动 Edge Functions（热重载） |
| `npm run supabase:push:local` | 应用迁移到本地数据库 |
| `npm run supabase:reset` | 重置本地数据库 |
| `npm run db:query "SQL"` | 直接查询数据库 |

---

## 🔄 日常开发流程

### 场景 1：完整本地开发（推荐）

同时开发前端和后端功能。

```bash
# 终端 1：后端
cd Lumi-supabase
npm run supabase:start
npm run supabase:functions

# 终端 2：前端
cd Lumi
npm run dev:local
```

### 场景 2：仅前端开发

只修改前端代码，不需要改后端。

```bash
cd Lumi
npm run dev:remote    # 直接连接远程 Supabase
```

### 场景 3：修改数据库结构

```bash
# 在后端仓库
cd Lumi-supabase

# 1. 创建迁移文件
npm run supabase:migration:new add_new_feature

# 2. 编辑 migrations/20260128XXXXXX_add_new_feature.sql

# 3. 应用到本地
npm run supabase:push:local

# 4. 验证
npm run db:query "SELECT * FROM new_table LIMIT 5;"
```

---

## 🌐 本地服务地址

| 服务 | 地址 | 用途 |
|------|------|------|
| **API** | https://127.0.0.1:54321 | 前端调用的 REST API |
| **Studio** | http://127.0.0.1:54323 | 可视化管理数据库 |
| **Inbucket** | http://127.0.0.1:54324 | 查看本地测试邮件 |
| **数据库** | localhost:54322 | 直接连接（postgres/postgres） |

---

## 🐛 常见问题

### Q1: 前端连接本地 Supabase 失败

**检查步骤**：
1. 确认后端 Supabase 已启动：`cd ../Lumi-supabase && npm run supabase:status`
2. 确认使用了正确的命令：`npm run dev:local`（不是 `npm run dev`）
3. 检查 `.env.local` 内容是否为本地配置

### Q2: AI 功能不工作

**原因**：Edge Functions 未启动

**解决方案**：
```bash
cd ../Lumi-supabase
npm run supabase:functions   # 需要新开终端
```

### Q3: 数据库表不存在

**原因**：迁移未应用

**解决方案**：
```bash
cd ../Lumi-supabase
npm run supabase:push:local
```

### Q4: 如何查看 Edge Functions 日志

```bash
docker logs supabase_edge_runtime_firego-local --tail 50 -f
```

---

## ⚠️ 云端部署安全规则

| 规则 | 说明 |
|------|------|
| **默认本地开发** | 所有后端代码默认在本地测试 |
| **禁止未授权部署** | 未经确认不得部署到云端 |

**禁止的操作**（除非用户明确要求）：
- `npm run supabase:push`（推送到云端）
- `npm run supabase:deploy`（部署到云端）
- `npm run supabase:sync`（同步到云端）

---

## 🔗 相关文档

- [后端仓库文档](../../../Lumi-supabase/docs/supabase-local-development.md) - 完整的后端开发指南
- [记忆系统](./memory-system.md) - AI 记忆系统架构
- [关键决策](../KEY_DECISIONS.md) - 技术决策记录
