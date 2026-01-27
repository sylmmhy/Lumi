# 记忆系统架构文档

> 最后更新：2026-01-27

## 1. 概述

项目采用**双轨记忆系统**设计：
- **内部系统** (`memory-extractor`)：完整的记忆管理，支持向量搜索和智能合并
- **外部系统** (`mem0-memory`)：集成 Mem0 第三方服务（备用方案）

**新增**：Tolan 级别 Multi-Query RAG 升级（2026-01-27）
- **Question Synthesis**：LLM 生成检索问题
- **Multi-Query RAG**：并行向量搜索
- **MRR 融合**：Mean Reciprocal Rank 智能排序
- **夜间压缩**：自动清理低价值记忆

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
| `importance_score` | FLOAT | **新增** 重要性评分 (0-1)，用于 RAG 排序和压缩决策 |
| `task_name` | TEXT | 产生该记忆的任务名称 |
| `embedding` | vector(1536) | OpenAI 向量嵌入 |
| `metadata` | JSONB | 灵活的元数据存储 |
| `access_count` | INTEGER | 访问计数 |
| `last_accessed_at` | TIMESTAMPTZ | 最后访问时间 |
| `merged_from` | UUID[] | 合并来源追踪 |
| `version` | INTEGER | **新增** 记忆版本号 |
| `superseded_by` | UUID | **新增** 被替代时指向新记忆 |
| `compression_status` | TEXT | **新增** 压缩状态：active/compressed/deleted |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 更新时间 |

### 2.2 索引

- `idx_user_memories_content_search`：GIN 全文搜索索引
- `idx_user_memories_embedding`：IVFFlat 向量相似度索引
- `idx_user_memories_user_tag`：用户+标签复合索引
- `idx_user_memories_importance`：**新增** 重要性排序索引
- `idx_user_memories_compression`：**新增** 压缩候选索引

### 2.3 RLS 安全策略

- 用户只能查看和删除**自己的**记忆
- Service Role 可以插入和更新（Edge Function 专用）

---

## 3. 记忆标签分类

| 标签 | 中文含义 | 说明 | 加载策略 | 基础重要性 |
|------|---------|------|---------|-----------|
| **PREF** | AI 交互偏好 | 用户对 AI 沟通方式的反馈 | **始终加载**（通用） | 0.7 |
| **PROC** | 拖延原因 | 用户为什么避免或延迟特定任务 | 按任务上下文加载 | 0.5 |
| **SOMA** | 身心反应 | 物理症状与特定活动的关联 | 按任务上下文加载 | 0.4 |
| **EMO** | 情绪触发 | 情绪与特定任务/情况的关联 | 按任务上下文加载 | 0.5 |
| **SAB** | 自我妨碍 | 削弱目标达成的重复行为 | 按任务上下文加载 | 0.5 |
| **EFFECTIVE** | 有效激励方式 | AI 成功激励用户时使用的方式 | **始终加载**（正向强化） | 0.8 |

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

## 4. Tolan 级别 Multi-Query RAG 架构

### 4.1 系统架构图

```
用户输入: "I'm excited for my trip this weekend"
                │
                ▼
┌───────────────────────────────────────────────────────────────┐
│ Phase 1: Question Synthesis (LLM)                              │
│ 输出: ["What trips does the user have?",                       │
│       "What are the user's travel preferences?",               │
│       "What emotions does the user associate with travel?"]    │
└───────────────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────┐
│ Phase 2: Parallel Embedding Generation (批量 API)              │
│ 并行为 N 个问题生成 embedding                                   │
└───────────────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────┐
│ Phase 3: Multi-Query Vector Search (并行 RPC)                  │
│ Query 1 → [Memory A, B, C, D, E]                               │
│ Query 2 → [Memory B, F, A, G, H]                               │
│ Query 3 → [Memory C, A, I, J, K]                               │
└───────────────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────┐
│ Phase 4: MRR Fusion                                            │
│ Memory A: 1/1 + 1/3 + 1/2 = 1.83 (最高分)                      │
│ 最终: [Memory A, Memory B, Memory C, ...]                      │
└───────────────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────┐
│ Phase 5: 注入系统指令 (取 top-10)                              │
└───────────────────────────────────────────────────────────────┘
```

### 4.2 MRR (Mean Reciprocal Rank) 融合算法

```
分数 = Σ (1 / rank_i) 对于记忆出现的每个查询

示例:
- Memory A 在 Query1 排第1, Query3 排第2
  score = 1/1 + 1/2 = 1.5

- Memory B 在 Query2 排第1
  score = 1/1 = 1.0

最终排序: [Memory A (1.5), Memory B (1.0), ...]
```

### 4.3 功能开关

```bash
# 启用 Tolan 级别记忆系统
ENABLE_TOLAN_MEMORY=true
```

- `true`：使用 Multi-Query RAG + MRR 融合
- `false`（默认）：使用传统关键词匹配

### 4.4 性能指标

| 步骤 | 目标延迟 | 说明 |
|------|---------|------|
| Question Synthesis | ~300ms | 低温度 LLM 调用 |
| Embedding Generation | ~200ms | 批量 API |
| Multi-Query Search | ~150ms | 并行 RPC |
| MRR Fusion | ~5ms | 内存计算 |
| **总计** | **~650ms** | |

---

## 5. 夜间压缩机制

### 5.1 压缩策略

| importance_score | 处理方式 | 说明 |
|-----------------|---------|------|
| 0.0-0.2 | 删除 | 琐碎/临时性记忆 |
| 0.3-0.5 | 软删除 | 有一定参考价值 |
| 0.6-0.8 | 保留 | 重要的行为模式 |
| 0.9-1.0 | 永久保留 | 核心洞察 |

### 5.2 压缩候选条件

满足以下任一条件的记忆会被考虑压缩：

1. **低重要性 + 老记忆**
   - `importance_score < 0.3`
   - `updated_at < NOW() - 7 days`

2. **长时间未访问**
   - `last_accessed_at < NOW() - 30 days`
   - `importance_score < 0.5`

3. **低置信度 + 从未访问**
   - `confidence < 0.4`
   - `last_accessed_at IS NULL`
   - `updated_at < NOW() - 7 days`

### 5.3 矛盾解决

当检测到相似但可能矛盾的记忆时：

```
1月记忆: "用户最喜欢蓝色"
3月记忆: "用户最喜欢绿色"
         ↓
LLM 分析 → 判断为"偏好更新"
         ↓
解决方案:
- 旧记忆: superseded_by = 新记忆 ID, compression_status = 'compressed'
- 新记忆: version = 2
```

### 5.4 Cron 配置

```sql
-- 每天凌晨 3:00 UTC 执行
SELECT cron.schedule(
  'memory_nightly_compression',
  '0 3 * * *',
  $$SELECT trigger_memory_compression()$$
);
```

---

## 6. 核心流程

```
用户对话 → AI 提取 → 计算重要性 → 生成 Embedding → 去重合并 → 存储 → AI 集成
                                                                    ↓
                                                              夜间压缩任务
```

### 6.1 记忆提取流程

1. **用户与 AI 教练对话**（Gemini Live）
2. **会话结束**时自动调用 `memory-extractor`
3. **Azure OpenAI** 按 6 种标签识别行为模式
4. 为每条记忆**计算初始重要性评分**
5. 为每条记忆生成 **1536 维向量嵌入**

### 6.2 重要性评分计算

```typescript
// 基础分数（按标签类型）
PREF: 0.7, EFFECTIVE: 0.8, PROC/EMO/SAB: 0.5, SOMA: 0.4

// 调整因素
+ 0.1  如果 confidence >= 0.8
+ 0.1  如果内容包含具体细节（数字、"always", "every time" 等）
+ 0.05 如果内容长度 > 100 字符
+ 0.1  每次合并（多次出现说明更重要）
```

### 6.3 去重合并机制

- **向量相似度 > 0.85** → 视为重复
- 调用 LLM 合并内容，保留所有细节
- 记录 `merged_from[]` 追踪合并历史
- **合并后 importance_score 提升**
- 删除被合并的源记忆

---

## 7. API 接口

### 7.1 memory-extractor（内部系统）

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

### 7.2 memory-compressor（新增）

**端点**：`POST /functions/v1/memory-compressor`

```typescript
// 压缩所有用户（cron 调用）
{ "action": "compress_all" }

// 压缩单个用户
{ "action": "compress_user", "userId": "xxx" }
```

**响应**：
```json
{
  "usersProcessed": 10,
  "totalEvaluated": 150,
  "totalDeleted": 23,
  "totalCompressed": 45,
  "contradictionsResolved": 5
}
```

### 7.3 数据库 RPC 函数

| 函数 | 说明 |
|------|------|
| `multi_query_search_memories` | Multi-Query RAG 向量搜索 |
| `get_compression_candidates` | 获取压缩候选 |
| `mark_memories_compressed` | 批量标记压缩 |
| `find_potential_contradictions` | 查找矛盾记忆 |
| `supersede_memory` | 标记记忆被替代 |

---

## 8. 与 AI 教练集成

### 8.1 系统指令注入

记忆通过 `get-system-instruction` Edge Function 注入到 AI 系统指令中：

```typescript
// Tolan 模式下的记忆获取
if (ENABLE_TOLAN_MEMORY) {
  // 1. PREF 全量加载
  // 2. EFFECTIVE 5 条加载
  // 3. Multi-Query RAG 获取任务相关记忆
  // 4. MRR 融合去重
  // 5. 取 top-10 注入
}
```

### 8.2 记忆影响 AI 行为

| 标签 | 影响方式 |
|------|---------|
| **PREF** | 始终加载，直接影响 AI 交互风格 |
| **PROC** | 识别拖延原因，提供针对性支持 |
| **EMO** | 了解情绪触发点，避免刺激 |
| **SOMA** | 注意身心状态，调整难度 |
| **SAB** | 识别自我妨碍行为，提前干预 |
| **EFFECTIVE** | 始终加载，复用成功激励策略 |

---

## 9. 前端集成

### 9.1 记忆自动保存

在 `useAICoachSession.ts` 中：

```typescript
// 会话结束时自动保存记忆
const saveSessionMemory = useCallback(async () => {
  const mem0Messages = messages
    .filter(msg => !msg.isVirtual)
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

### 9.2 记忆展示 UI

`MemoriesSection.tsx` 组件：
- 在用户资料页展示
- 可折叠设计，点击展开查看
- 按标签分组显示
- 支持单条删除

---

## 10. 任务成功元数据

除了 `user_memories` 表的记忆系统，项目还在 `tasks` 表中记录用户的**行为完成数据**，用于正向记忆激励系统。

### 10.1 成功元数据字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `completion_mood` | TEXT | 完成时情绪：proud/relieved/satisfied/neutral |
| `difficulty_perception` | TEXT | 难度感知：easier_than_usual/normal/harder_than_usual |
| `overcame_resistance` | BOOLEAN | 是否克服了阻力（一开始不想做但最终完成） |
| `actual_duration_minutes` | INTEGER | 实际完成时长（分钟） |
| `personal_best_at_completion` | INTEGER | 完成时的个人最佳记录 |

### 10.2 辅助函数

| 函数 | 说明 |
|------|------|
| `get_personal_best(user_id, task_keywords)` | 获取某任务类型的个人最佳时长 |
| `calculate_user_streak(user_id, task_keywords)` | 计算连续完成天数 |
| `get_user_success_summary(user_id, task_keywords)` | 获取成功记录摘要 |

---

## 11. 文件位置清单

| 组件 | 路径 |
|------|------|
| **Tolan 迁移** | `supabase/migrations/20260127100000_tolan_memory_system.sql` |
| **Cron 迁移** | `supabase/migrations/20260127110000_memory_compression_cron.sql` |
| **记忆表迁移** | `supabase/migrations/20260108*_*.sql`、`20260109*_*.sql` |
| **内部记忆 API** | `supabase/functions/memory-extractor/index.ts` |
| **压缩器 API** | `supabase/functions/memory-compressor/index.ts` |
| **系统指令生成** | `supabase/functions/get-system-instruction/index.ts` |
| **前端 Hook** | `src/hooks/useAICoachSession.ts` |
| **记忆展示 UI** | `src/components/profile/MemoriesSection.tsx` |

---

## 12. 环境变量

```bash
# 功能开关
ENABLE_TOLAN_MEMORY=true  # 启用 Tolan 级别 Multi-Query RAG

# Azure AI（memory-extractor 使用）
AZURE_AI_ENDPOINT=https://xxx.openai.azure.com
AZURE_AI_API_KEY=xxx
MEMORY_EXTRACTOR_MODEL=gpt-5.1-chat

# Embedding
AZURE_EMBEDDING_ENDPOINT=xxx
AZURE_EMBEDDING_API_KEY=xxx
MEMORY_EMBEDDING_MODEL=text-embedding-3-large

# Mem0（可选，备用方案）
MEM0_API_KEY=xxx
```

---

## 13. 技术指标

| 指标 | 值 |
|------|-----|
| 向量维度 | 1536 |
| 相似度阈值（RAG） | 0.6 |
| 相似度阈值（去重） | 0.85（向量）/ 0.40（文本回退） |
| 提取模型 | gpt-5.1-chat |
| 嵌入模型 | text-embedding-3-large |
| 记忆标签数 | 6 |
| 每查询返回数 | 5 |
| 最终记忆数 | 10 |
| 缓存 TTL | 5 分钟 |

---

## 14. 回滚策略

1. **即时回滚**：设置 `ENABLE_TOLAN_MEMORY=false`
2. **数据库**：新字段不影响旧代码，无需回滚迁移
3. **Cron 暂停**：`SELECT cron.unschedule('memory_nightly_compression');`

---

## 15. 数据流示意图

```
┌─────────────────────────────────────────────────────────────────┐
│                    记忆系统完整数据流 (Tolan 级别)               │
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
│                             │  ├─ 计算 importance_score │
│                             │  ├─ 生成 Embedding       │
│                             │  ├─ 查询相似记忆 ───────► search_similar_memories()
│                             │  └─ 合并或插入 ─────────► user_memories 表
│                             │                          │
├─ startSession               │                          │
│  └─ 获取系统指令 ───────────► get-system-instruction   │
│                             │  ├─ PREF 全量加载 ──────► SELECT WHERE tag = 'PREF'
│                             │  ├─ EFFECTIVE 加载 ─────► SELECT WHERE tag = 'EFFECTIVE'
│                             │  ├─ Question Synthesis   │
│                             │  ├─ Multi-Query RAG ────► multi_query_search_memories()
│                             │  └─ MRR 融合 → 注入指令  │
│                             │                          │
│                             │                          │
│           [每日凌晨 3:00 UTC]                          │
│                             │                          │
│                             ◄────────────────────────── pg_cron 触发
│                             │                          │
│                             ► memory-compressor        │
│                               ├─ 获取候选 ────────────► get_compression_candidates()
│                               ├─ LLM 评估重要性        │
│                               ├─ 解决矛盾 ────────────► find_potential_contradictions()
│                               └─ 标记压缩 ────────────► mark_memories_compressed()
│                             │                          │
└─────────────────────────────────────────────────────────────────┘
```
