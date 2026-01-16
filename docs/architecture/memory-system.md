# 记忆系统架构文档

> 最后更新：2026-01-15

## 1. 概述

项目采用**双轨记忆系统**设计：
- **内部系统** (`memory-extractor`)：完整的记忆管理，支持向量搜索和智能合并
- **外部系统** (`mem0-memory`)：集成 Mem0 第三方服务（备用方案）

记忆系统的核心目标是：**让 AI 教练理解用户的行为模式和偏好，提供个性化的陪伴体验**。

---

## 2. 数据库结构

### 2.1 主表：`user_memories`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `user_id` | UUID | 用户 ID（外键关联 auth.users） |
| `content` | TEXT | 记忆内容（AI 提取的见解） |
| `tag` | TEXT | 分类标签（6 种，见下表） |
| `confidence` | FLOAT | 置信度 (0-1) |
| `task_name` | TEXT | 产生该记忆的任务名称 |
| `embedding` | vector(1536) | OpenAI 向量嵌入 |
| `metadata` | JSONB | 灵活的元数据存储 |
| `access_count` | INTEGER | 访问计数 |
| `last_accessed_at` | TIMESTAMPTZ | 最后访问时间 |
| `merged_from` | UUID[] | 合并来源追踪 |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 更新时间 |

### 2.2 索引

- `idx_user_memories_content_search`：GIN 全文搜索索引
- `idx_user_memories_embedding`：IVFFlat 向量相似度索引
- `idx_user_memories_user_tag`：用户+标签复合索引

### 2.3 RLS 安全策略

- 用户只能查看和删除**自己的**记忆
- Service Role 可以插入和更新（Edge Function 专用）

---

## 3. 记忆标签分类

| 标签 | 中文含义 | 说明 | 加载策略 |
|------|---------|------|---------|
| **PREF** | AI 交互偏好 | 用户对 AI 沟通方式的反馈 | **始终加载**（通用） |
| **PROC** | 拖延原因 | 用户为什么避免或延迟特定任务 | 按任务上下文加载 |
| **SOMA** | 身心反应 | 物理症状与特定活动的关联 | 按任务上下文加载 |
| **EMO** | 情绪触发 | 情绪与特定任务/情况的关联 | 按任务上下文加载 |
| **SAB** | 自我妨碍 | 削弱目标达成的重复行为 | 按任务上下文加载 |
| **EFFECTIVE** | 有效激励方式 | AI 成功激励用户时使用的方式 | **始终加载**（正向强化） |

### 3.1 提取规则示例

**会被提取的（高价值见解）**：
- ✅ "User dislikes being rushed or pressured by AI" → PREF
- ✅ "User avoids exercise because it feels overwhelming to start" → PROC
- ✅ "User reports recurring headaches specifically before workout" → SOMA
- ✅ "User feels anxious when facing deadlines" → EMO
- ✅ "User checks phone immediately before important tasks" → SAB
- ✅ "User responds well to countdown pressure" → EFFECTIVE
- ✅ "User is motivated by streak reminders" → EFFECTIVE

**不会被提取的（过滤掉）**：
- ❌ 时间/日期提及（"it's 4pm", "today"）
- ❌ 基本意图（"wants to workout"）
- ❌ 任务完成状态（"finished task"）
- ❌ 寒暄和闲聊
- ❌ 单一事件（无模式意义）

---

## 4. 核心流程

```
用户对话 → AI 提取 → 生成 Embedding → 去重合并 → 存储 → AI 集成
```

### 4.1 记忆提取流程

1. **用户与 AI 教练对话**（Gemini Live）
2. **会话结束**时自动调用 `memory-extractor`
3. **Azure OpenAI** 按 6 种标签识别行为模式
4. 为每条记忆生成 **1536 维向量嵌入**

### 4.2 去重合并机制

- **向量相似度 > 0.85** → 视为重复
- 调用 LLM 合并内容，保留所有细节
- 记录 `merged_from[]` 追踪合并历史
- 删除被合并的源记忆

### 4.3 整合功能（Consolidate）

定期或手动调用，对已有记忆进行整理：
1. 按标签遍历用户的所有记忆
2. 使用贪心聚类找相似记忆组
3. 对每个相似组调用 LLM 合并
4. 删除冗余，保留追踪

---

## 5. API 接口

### 5.1 memory-extractor（内部系统）

**端点**：`POST /functions/v1/memory-extractor`

```typescript
interface MemoryRequest {
  action: 'extract' | 'search' | 'get' | 'delete' | 'consolidate'
  userId: string
  messages?: Array<{ role: string; content: string }>
  taskDescription?: string
  query?: string  // search 操作使用
  tag?: string    // consolidate 操作可选
  memoryId?: string  // delete 操作使用
  metadata?: Record<string, unknown>
}
```

**操作说明**：

| action | 说明 |
|--------|------|
| `extract` | 从对话中提取新记忆 |
| `search` | 搜索相关记忆（文本/向量） |
| `get` | 获取用户所有记忆 |
| `delete` | 删除指定记忆 |
| `consolidate` | 整合重复记忆 |

### 5.2 mem0-memory（外部系统，备用）

**端点**：`POST /functions/v1/mem0-memory`

```typescript
interface Mem0Request {
  action: 'add' | 'search' | 'get' | 'delete'
  userId: string
  messages?: Array<{ role: string; content: string }>
  query?: string
  limit?: number
  memoryId?: string
  customPrompt?: string
}
```

---

## 6. 与 AI 教练集成

### 6.1 系统指令注入

记忆通过 `get-system-instruction` Edge Function 注入到 AI 系统指令中：

```typescript
// useAICoachSession.ts 中的 startSession()
const { data } = await supabaseClient.functions.invoke('get-system-instruction', {
  body: {
    taskInput: taskDescription,
    userName: userName,
    userId: userId,  // 用于查询用户记忆
    localTime: '14:30',
    localDate: 'Wednesday, Jan 7'
  }
})
```

### 6.2 记忆影响 AI 行为

| 标签 | 影响方式 |
|------|---------|
| **PREF** | 始终加载，直接影响 AI 交互风格 |
| **PROC** | 识别拖延原因，提供针对性支持 |
| **EMO** | 了解情绪触发点，避免刺激 |
| **SOMA** | 注意身心状态，调整难度 |
| **SAB** | 识别自我妨碍行为，提前干预 |
| **EFFECTIVE** | 始终加载，复用成功激励策略 |

---

## 7. 前端集成

### 7.1 记忆自动保存

在 `useAICoachSession.ts` 中：

```typescript
// 会话结束时自动保存记忆
const saveSessionMemory = useCallback(async () => {
  const mem0Messages = messages
    .filter(msg => !msg.isVirtual)  // 过滤虚拟消息
    .map(msg => ({
      role: msg.role === 'ai' ? 'assistant' : 'user',
      content: msg.content,
    }))

  await supabaseClient.functions.invoke('memory-extractor', {
    body: {
      action: 'extract',
      userId,
      messages: mem0Messages,
      taskDescription,
      metadata: { source: 'ai_coach_session' }
    }
  })
}, [messages])
```

### 7.2 记忆展示 UI

`MemoriesSection.tsx` 组件：
- 在用户资料页展示
- 可折叠设计，点击展开查看
- 按标签分组显示
- 支持单条删除

---

## 8. 任务成功元数据

除了 `user_memories` 表的记忆系统，项目还在 `tasks` 表中记录用户的**行为完成数据**，用于正向记忆激励系统。

### 8.1 成功元数据字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `completion_mood` | TEXT | 完成时情绪：proud/relieved/satisfied/neutral |
| `difficulty_perception` | TEXT | 难度感知：easier_than_usual/normal/harder_than_usual |
| `overcame_resistance` | BOOLEAN | 是否克服了阻力（一开始不想做但最终完成） |
| `actual_duration_minutes` | INTEGER | 实际完成时长（分钟） |
| `personal_best_at_completion` | INTEGER | 完成时的个人最佳记录 |

### 8.2 辅助函数

| 函数 | 说明 |
|------|------|
| `get_personal_best(user_id, task_keywords)` | 获取某任务类型的个人最佳时长 |
| `calculate_user_streak(user_id, task_keywords)` | 计算连续完成天数 |
| `get_user_success_summary(user_id, task_keywords)` | 获取成功记录摘要（总完成数、连胜、最佳等） |

### 8.3 与记忆系统的关系

```
任务完成 → 记录成功元数据(tasks) → AI 提取 EFFECTIVE 记忆 → 注入系统指令
                ↓
        用于计算连胜、个人最佳等正向激励数据
```

**迁移文件**：`supabase/migrations/20260108210000_add_success_metadata_to_tasks.sql`

---

## 9. 文件位置清单

| 组件 | 路径 |
|------|------|
| **记忆表迁移** | `supabase/migrations/20260108*_*.sql`、`20260109*_*.sql` |
| **任务成功元数据迁移** | `supabase/migrations/20260108210000_add_success_metadata_to_tasks.sql` |
| **内部记忆 API** | `supabase/functions/memory-extractor/index.ts` |
| **外部记忆 API** | `supabase/functions/mem0-memory/index.ts` |
| **系统指令生成** | `supabase/functions/get-system-instruction/index.ts` |
| **前端 Hook** | `src/hooks/useAICoachSession.ts` |
| **记忆展示 UI** | `src/components/profile/MemoriesSection.tsx` |

---

## 10. 环境变量

```bash
# Azure AI（memory-extractor 使用）
AZURE_AI_ENDPOINT=https://xxx.openai.azure.com
AZURE_AI_API_KEY=xxx
MEMORY_EXTRACTOR_MODEL=gpt-5.1-chat
MEMORY_EMBEDDING_MODEL=text-embedding-3-large

# Mem0（可选，备用方案）
MEM0_API_KEY=xxx
```

---

## 11. 技术指标

| 指标 | 值 |
|------|-----|
| 向量维度 | 1536 |
| 相似度阈值 | 0.85（向量）/ 0.40（文本回退） |
| 提取模型 | gpt-5.1-chat |
| 嵌入模型 | text-embedding-3-large |
| 记忆标签数 | 6 |

---

## 12. 数据流示意图

```
┌─────────────────────────────────────────────────────────────────┐
│                    记忆系统完整数据流                            │
└─────────────────────────────────────────────────────────────────┘

前端 (React)                  Edge Functions              数据库 (PostgreSQL)
─────────────                 ─────────────              ──────────────────
│                             │                          │
├─ useAICoachSession          │                          │
│  └─ Gemini Live 对话        │                          │
│     │                       │                          │
│     └─ 会话结束             │                          │
│        │                    │                          │
│        └─ saveSessionMemory │                          │
│           │                 │                          │
│           └─────────────────► memory-extractor         │
│                             │  ├─ AI 提取记忆          │
│                             │  ├─ 生成 Embedding       │
│                             │  ├─ 查询相似记忆 ───────► search_similar_memories()
│                             │  └─ 合并或插入 ─────────► user_memories 表
│                             │                          │
├─ MemoriesSection            │                          │
│  └─ 加载用户记忆 ───────────────────────────────────────► SELECT * FROM user_memories
│  └─ 删除记忆 ──────────────────────────────────────────► DELETE FROM user_memories
│                             │                          │
├─ startSession               │                          │
│  └─ 获取系统指令 ───────────► get-system-instruction   │
│                             │  └─ 查询 PREF 记忆 ──────► SELECT WHERE tag = 'PREF'
│                             │  └─ 注入到系统指令        │
│                             │                          │
└─────────────────────────────────────────────────────────────────┘
```
