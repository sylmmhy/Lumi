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

### 3. Seed 数据问题 ✅

**症状**：`supabase db reset` 时报多种错误

**根因**（三个问题）：

1. **VALUES 列表长度不匹配**：tasks INSERT 的第三条记录有 15 个值，但列定义只有 14 列
2. **触发器问题**：tasks 插入时触发 `check_task_on_insert()` 函数，该函数查询 `user_devices` 表
3. **外键约束问题**：`user_memories.user_id` 外键指向 `auth.users`，而非 `public.users`

**解决方案**：

1. 将已完成任务拆分为独立 INSERT（添加 `completed_at` 列）：
   ```sql
   -- 单独 INSERT 已完成任务，包含 completed_at 列
   INSERT INTO public.tasks (..., completed_at) VALUES (...);
   ```

2. 在 tasks INSERT 前后禁用/启用触发器：
   ```sql
   ALTER TABLE public.tasks DISABLE TRIGGER task_insert_check;
   -- ... INSERT 语句 ...
   ALTER TABLE public.tasks ENABLE TRIGGER task_insert_check;
   ```

3. 在 `auth.users` 中也创建测试用户：
   ```sql
   INSERT INTO auth.users (id, email, aud, role, created_at, updated_at)
   VALUES
       ('11111111-...', 'xiaoming@test.local', 'authenticated', 'authenticated', NOW(), NOW()),
       ...;
   ```

4. 使用 `BEGIN;` ... `COMMIT;` 包裹整个文件，确保事务一致性

**状态**：✅ 已修复，`supabase db reset` 成功填充测试数据

**验证结果**：
- 3 个测试用户（小明、小红、John）
- 6 个测试任务（3 pending + 3 completed）
- 5 条测试记忆（PREF、PROC、SOMA、EFFECTIVE x2）
- 2 个测试访客

---

## 📁 已修改的文件

| 文件 | 修改内容 |
|------|---------|
| `supabase/functions/gemini-token/index.ts` | 使用新的 SDK API 创建 ephemeral token |
| `supabase/migrations/00000000000000_schema.sql` | 从 init.sql 重命名，添加扩展和角色 |
| `supabase/config.toml` | 启用 seed |
| `supabase/seed.sql` | 修复列名、触发器、外键约束问题 |
| `docs/architecture/supabase-local-development.md` | 添加了 Q6 Gemini Token 问题说明 |

---

## 🎯 下一步行动

### 立即执行

1. **启动 Edge Functions**：`npm run supabase:functions`
2. **启动前端**：`npm run dev:local`
3. **测试 AI 对话功能**

### 验证测试

1. 在本地 Studio (http://127.0.0.1:54323) 确认所有表和数据存在
2. 测试 AI 对话功能是否正常工作
3. 测试记忆存储和检索功能

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
| Seed 数据 | ✅ 已修复 |
| Edge Functions | ⚠️ 需要启动 |
| AI 对话测试 | ⏳ 待测试 |
