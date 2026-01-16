# 本地 Supabase 调试进度

---
title: 本地 Supabase 调试
stage: 🔄 进行中
started: 2026-01-16
updated: 2026-01-16
owner: Claude
---

## 📋 问题背景

用户想要测试本地 Supabase 的 AI 功能（记忆存储、Gemini Live 对话等），但遇到了多个问题。

---

## ✅ 已解决的问题

### 1. Gemini Token 404 错误 ✅

**症状**：启动 AI 对话时报错 `Failed to get token from Google: 404`

**根因**：Google 已废弃旧的 `generateToken` REST API 端点

**解决方案**：更新 `supabase/functions/gemini-token/index.ts`

```typescript
// 旧方式（已废弃）
const tokenResponse = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateToken?key=${apiKey}`
);

// 新方式（SDK）
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
```

**状态**：✅ 已修复，已测试通过

---

### 2. 本地数据库表不完整 ✅

**症状**：本地 Studio 只显示 5 个表，远端有 23 个表

**根因**：
1. 迁移文件名 `00000000000000_init.sql` 包含 "init"，被 Supabase CLI 自动跳过
2. 缺少 `pgvector` 扩展
3. 缺少 `admin_user` 角色

**解决方案**：

1. 重命名迁移文件：
   ```bash
   mv supabase/migrations/00000000000000_init.sql supabase/migrations/00000000000000_schema.sql
   ```

2. 在 schema.sql 开头添加：
   ```sql
   -- 启用 pgvector 扩展
   CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

   -- 创建 admin_user 角色
   DO $$
   BEGIN
     IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'admin_user') THEN
       CREATE ROLE "admin_user" NOLOGIN;
     END IF;
   END
   $$;
   ```

3. 清除 Docker 数据卷并重启：
   ```bash
   supabase stop --no-backup
   supabase start
   ```

**状态**：✅ 已修复，本地现在有 24 个表

---

## ⚠️ 待解决的问题

### 3. Seed 数据列名不匹配 ⏸️

**症状**：`supabase db reset` 时 seed.sql 报错 `column "memory_text" does not exist`

**根因**：`supabase/seed.sql` 中的 `user_memories` 表列名与实际表定义不匹配

**需要修改**（seed.sql 第 255-261 行）：

| 错误列名 | 正确列名 |
|---------|---------|
| `memory_text` | `content` |
| `memory_tag` | `tag` |
| `source_task_name` | `task_name` |

**已做**：修改了 `memory_text` → `content`, `memory_tag` → `tag`, `source_task_name` → `task_name`

**未完成**：还有其他 INSERT 语句可能有 VALUES 列表长度不匹配的问题

**临时方案**：已在 `config.toml` 中禁用 seed：
```toml
[db.seed]
enabled = false  # 暂时禁用
```

**下一步**：需要完整检查并修复 `supabase/seed.sql` 中的所有 INSERT 语句

---

## 📁 已修改的文件

| 文件 | 修改内容 |
|------|---------|
| `supabase/functions/gemini-token/index.ts` | 使用新的 SDK API 创建 ephemeral token |
| `supabase/migrations/00000000000000_schema.sql` | 从 init.sql 重命名，添加扩展和角色 |
| `supabase/config.toml` | 禁用 seed（临时） |
| `supabase/seed.sql` | 部分修复了列名（未完成） |
| `docs/architecture/supabase-local-development.md` | 添加了 Q6 Gemini Token 问题说明 |

---

## 🎯 下一步行动

### 立即执行

1. **修复 seed.sql**：检查并修复所有 INSERT 语句的列名
2. **重新启用 seed**：在 config.toml 中设置 `enabled = true`
3. **测试完整流程**：`supabase db reset` 应该能成功填充测试数据

### 验证测试

1. 在本地 Studio (http://127.0.0.1:54323) 确认所有表存在
2. 启动 Edge Functions：`npm run supabase:functions`
3. 测试 AI 对话功能是否正常工作

---

## 🔧 关键命令

```bash
# 启动本地 Supabase
npm run supabase:start

# 启动 Edge Functions（另一个终端）
npm run supabase:functions

# 启动前端
npm run dev:local

# 重置数据库（应用迁移 + seed）
supabase db reset

# 查看本地服务状态
supabase status
```

---

## 📊 当前状态

| 组件 | 状态 |
|------|------|
| 本地 Supabase | ✅ 运行中 |
| 数据库表（24个） | ✅ 完整 |
| Gemini Token API | ✅ 已修复 |
| Edge Functions | ⚠️ 需要启动 |
| Seed 数据 | ❌ 暂时禁用 |
| AI 对话测试 | ⏳ 待测试 |
