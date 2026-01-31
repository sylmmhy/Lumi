# 记忆系统架构

> 最后更新：2026-01-29

---

## 一句话说明

**记忆系统让 AI 教练"认识"用户**：记住用户的行为模式、偏好、拖延原因、有效激励方式，从而提供个性化陪伴。

---

## 核心架构图

```
用户对话 → AI 提取记忆 → 存入数据库（带向量）
                              ↓
下次对话 → 检索相关记忆 → 注入 AI 系统指令 → 个性化回复
                              ↓
                        每晚自动清理低价值记忆
```

---

## 接口速查（最重要）

### 存储记忆 → `memory-extractor`

**文件**：`supabase/functions/memory-extractor/index.ts`

**调用方式**：
```typescript
await supabase.functions.invoke('memory-extractor', {
  body: {
    action: 'extract',           // 必填
    userId: 'uuid-xxx',          // 必填
    messages: [                  // 必填：对话历史
      { role: 'user', content: '我不想运动' },
      { role: 'assistant', content: '我理解...' },
    ],
    taskDescription: '健身',      // 可选
    localDate: '2026-01-29',     // 可选：用户本地日期，用于转换相对时间
    metadata: { source: 'ai_coach_session' }  // 可选
  }
})
```

**谁在调用**：`src/hooks/useAICoachSession.ts` 的 `saveSessionMemory()` 方法

---

### 检索记忆 → `get-system-instruction`

**文件**：`supabase/functions/get-system-instruction/index.ts`

**调用方式**：
```typescript
const { data } = await supabase.functions.invoke('get-system-instruction', {
  body: {
    taskInput: '整理行李',        // 必填：任务描述
    userId: 'uuid-xxx',          // 必填
    userName: '小明',             // 可选
    preferredLanguages: ['zh-CN'], // 可选
    localTime: '14:30',          // 可选：给 AI 看的时间
    localDate: 'Wednesday, Jan 29', // 可选：给 AI 看的日期（人类可读）
    localDateISO: '2026-01-29'   // 可选：用于处理 event_date（ISO 格式）
  }
})

// 返回值
data.systemInstruction   // AI 系统指令（包含记忆）
data.successRecord       // 用户成功记录
data.retrievedMemories   // 检索到的记忆列表（调试用）
```

**谁在调用**：`src/hooks/useAICoachSession.ts` 的 `startSession()` 方法

---

### 夜间压缩 → `memory-compressor`

**文件**：`supabase/functions/memory-compressor/index.ts`

**调用方式**（由 pg_cron 自动调用）：
```typescript
// 压缩所有用户
{ action: 'compress_all' }

// 压缩单个用户
{ action: 'compress_user', userId: 'uuid-xxx' }
```

---

### 数据库 RPC 函数

| 函数名 | 文件 | 用途 |
|--------|------|------|
| `tiered_search_memories` | `migrations/20260128111500_fix_tiered_search.sql` | 分层向量搜索 |
| `search_similar_memories_cross_tag` | `migrations/20260128120000_multi_tag_memory.sql` | **跨 tag 搜索**（用于合并去重） |
| `update_memory_access` | `migrations/20260127120000_tiered_memory_search.sql` | 更新访问时间 |
| `multi_query_search_memories` | `migrations/20260127100000_tolan_memory_system.sql` | 多查询并行搜索 |

---

## 记忆的 7 种标签

| 标签 | 含义 | 加载策略 | 举例 |
|------|------|---------|------|
| **PREF** | AI 交互偏好 | **始终加载** | "用户不喜欢被催促" |
| **EFFECTIVE** | 有效激励方式 | **始终加载** | "倒数 3-2-1 对用户有效" |
| **CONTEXT** | 生活背景/计划 | 按任务匹配 | "用户计划1月30日去迪士尼" |
| **PROC** | 拖延原因 | 按任务匹配 | "用户觉得运动太累" |
| **EMO** | 情绪模式 | 按任务匹配 | "用户面对 deadline 会焦虑" |
| **SOMA** | 身心反应 | 按任务匹配 | "用户运动前会头疼" |
| **SAB** | 自我妨碍 | 按任务匹配 | "用户开始工作前会先刷手机" |

**CONTEXT 标签特殊说明**：用于存储用户的生活事件、旅行计划、人际关系等背景信息。部分 CONTEXT 记忆带有 `event_date` 字段，用于时间感知处理（详见下方）。

---

## 记忆检索：四层架构

当用户开始任务时，系统分四层检索记忆：

```
┌────────────────────────────────────────────────────────────┐
│ 第一层：偏好层（始终加载）                                    │
│ • PREF + EFFECTIVE 标签                                     │
│ • 无论什么任务都会加载                                        │
└────────────────────────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────────────────────────┐
│ 第二层：核心层（阈值 ≥ 0.5）                                  │
│ • 与当前任务直接相关的记忆                                    │
│ • 例：任务"整理行李" → 找到"用户要去迪士尼"                   │
└────────────────────────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────────────────────────┐
│ 第三层：扩展层（阈值 0.3-0.5）                                │
│ • 间接相关的记忆，捕获更远的语义关联                           │
│ • 例：任务"整理行李" → 找到"男朋友可能太忙没法陪"              │
└────────────────────────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────────────────────────┐
│ 第四层：任务历史层                                           │
│ • 按 task_name 模糊匹配历史记忆                               │
│ • 例：任务"整理行李" → 找到上次整理行李时的记忆               │
└────────────────────────────────────────────────────────────┘
```

---

## 关键数值配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| **核心层阈值** | 0.5 | 相似度 ≥ 0.5 算直接相关 |
| **扩展层阈值** | 0.3 | 相似度 0.3-0.5 算间接相关 |
| **扩展层数量** | 5 条 | 最多取 5 条扩展层记忆 |
| **任务历史数量** | 3 条 | 最多取 3 条任务历史记忆 |
| **最终返回数量** | 20 条 | 总共最多返回 20 条记忆给 AI |
| **合并阈值** | 0.75 | 相似度 > 0.75 视为重复，会跨 tag 合并 |
| **向量维度** | 1536 | 使用 OpenAI text-embedding-3-large |
| **缓存时间** | 5 分钟 | 同一任务 5 分钟内复用缓存 |

---

## 热/温/冷分层（按访问时间）

在核心层和扩展层搜索时，还会按访问时间分层：

| 层级 | 条件 | 搜索优先级 |
|------|------|-----------|
| **热层** | 最近 7 天访问过 | 优先搜索 |
| **温层** | 7-30 天未访问 | 热层不够时才搜 |
| **冷层** | 30+ 天未访问 | 不参与日常搜索 |

**特殊规则**：PREF 和 EFFECTIVE 标签始终算热层。

---

## 时间感知功能（CONTEXT 记忆专属）

### 问题背景

用户说"我明天要去迪士尼"时，如果系统只存储"用户要去迪士尼"，第二天 AI 还会说"你明天要去迪士尼哦"——这不对，因为"明天"已经变成"今天"了。

### 解决方案

```
┌─────────────────────────────────────────────────────────────────┐
│  存储时（memory-extractor）                                      │
│  用户说 "明天去迪士尼"（1月29日）                                  │
│                    ↓                                             │
│  AI 提取时转换为绝对日期：                                        │
│  content: "用户计划1月30日去迪士尼"                               │
│  event_date: "2026-01-30"  ← 存入 metadata                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  检索时（get-system-instruction）                                │
│  每次用户开始新会话，都会重新计算 diffDays：                        │
│                                                                  │
│  diffDays = 今天日期 - event_date                                │
│                                                                  │
│  • diffDays = 0（今天）  → 原样返回                               │
│  • diffDays = 1-3（刚过去）→ 添加"（已过去）"标注                  │
│  • diffDays > 3（过去太久）→ 过滤掉，不给 AI 看                    │
└─────────────────────────────────────────────────────────────────┘
```

### 具体例子

| 日期 | 用户开新会话 | AI 看到的记忆 | AI 行为 |
|------|------------|--------------|--------|
| 1月29日 | ✓ | "用户计划1月30日去迪士尼" | "明天就去迪士尼啦！" |
| 1月30日 | ✓ | "用户计划1月30日去迪士尼" | "今天是迪士尼的日子！" |
| 1月31日 | ✓ | "用户去迪士尼（已过去，发生于 2026-01-30）" | "迪士尼玩得怎么样？" |
| 2月3日 | ✓ | （记忆被过滤，AI 看不到） | 不提这个旧事件 |

### 关键点

1. **数据库只存一次**：`event_date: "2026-01-30"` 永久存在 `metadata` 里
2. **每次检索都重新计算**：`diffDays` 不是存储的，是实时算的
3. **标注是临时的**："（已过去）"标注不存数据库，只在返回给 AI 时临时加上

### 涉及的代码位置

| 步骤 | 文件 | 函数/位置 |
|------|------|---------|
| 存储 event_date | `memory-extractor/index.ts` | `saveOrMergeMemories()` 中的 metadata |
| 计算 diffDays | `get-system-instruction/index.ts` | `processMemoriesWithEventDate()` |
| AI 理解"已过去" | `_shared/prompts/lumi-system.ts` | memoriesSection 中的说明 |

---

## 核心流程

### 1. 记忆提取（会话结束时）

```
用户与 AI 对话 → 会话结束 → 调用 memory-extractor
                              ↓
                    AI 识别行为模式，打标签
                              ↓
                    生成向量嵌入 + 计算重要性分数
                              ↓
                    查重去重 → 存入 user_memories 表
```

### 2. 记忆检索（任务开始时）

```
用户输入任务描述 → 调用 get-system-instruction
                              ↓
                    话题规则匹配 → 生成种子问题
                              ↓
                    Question Synthesis → LLM 扩展问题
                              ↓
                    并行向量搜索（核心层 + 扩展层 + 任务历史）
                              ↓
                    MRR 融合排序 → 去重 → 取 top 20
                              ↓
                    注入 AI 系统指令
```

### 3. 夜间压缩（每天凌晨 3:00）

```
pg_cron 触发 → 调用 memory-compressor
                              ↓
                    找出低价值记忆（重要性 < 0.3 且 7 天未更新）
                              ↓
                    找出矛盾记忆 → LLM 判断保留哪个
                              ↓
                    删除/标记压缩/合并
```

---

## 数据库表：user_memories

| 字段 | 说明 |
|------|------|
| `id` | 主键 UUID |
| `user_id` | 用户 ID |
| `content` | 记忆内容 |
| `tag` | 主标签（PREF/PROC/SOMA/EMO/SAB/EFFECTIVE/CONTEXT） |
| `metadata.event_date` | （可选）事件日期 YYYY-MM-DD，仅 CONTEXT 标签使用 |
| `tags` | **多标签数组**（跨 tag 合并时保留所有标签） |
| `confidence` | 置信度 (0-1) |
| `importance_score` | 重要性评分 (0-1)，用于压缩决策 |
| `task_name` | 产生该记忆的任务名称 |
| `embedding` | 向量嵌入 (1536 维) |
| `last_accessed_at` | 最后访问时间（用于热/温/冷分层） |
| `compression_status` | 压缩状态：active/compressed/deleted |

**多标签说明**：当跨 tag 合并记忆时（如 EMO + PROC），`tags` 数组会保留所有标签，`tag` 字段保留优先级最高的标签。

---

## 环境变量

```bash
# 功能开关
ENABLE_TOLAN_MEMORY=true      # 启用 Multi-Query RAG

# Azure AI（记忆提取和问题合成）
AZURE_AI_ENDPOINT=xxx
AZURE_AI_API_KEY=xxx
MEMORY_EXTRACTOR_MODEL=gpt-5.1-chat

# Embedding（向量嵌入）
AZURE_EMBEDDING_ENDPOINT=xxx
AZURE_EMBEDDING_API_KEY=xxx
MEMORY_EMBEDDING_MODEL=text-embedding-3-large
```

---

## 用户体验对比

### 升级前（只用关键词匹配）

> 用户任务：整理行李
> AI："你要整理行李啊，加油！"

### 升级后（四层语义检索）

> 用户任务：整理行李
> AI："迪士尼之旅明天就出发啦！一个人去也很棒的，先把行李收好~"

**差异**：AI 能关联到"去迪士尼"、"男朋友可能没空陪"等更深层的背景信息。

---

## 性能指标

| 步骤 | 耗时 |
|------|------|
| 偏好层查询 | ~20ms |
| 核心层向量搜索 | ~100ms |
| 扩展层向量搜索 | ~50ms |
| 任务历史查询 | ~30ms |
| **总计** | ~200ms |

用户几乎无感知。

---

## 回滚策略

1. **即时回滚**：设置 `ENABLE_TOLAN_MEMORY=false`，回退到传统关键词匹配
2. **暂停夜间压缩**：`SELECT cron.unschedule('memory_nightly_compression');`
3. **数据安全**：新字段不影响旧代码，无需回滚数据库迁移

---

## 文件位置

| 组件 | 路径 |
|------|------|
| 记忆检索 | `supabase/functions/get-system-instruction/index.ts` |
| 记忆提取 | `supabase/functions/memory-extractor/index.ts` |
| 夜间压缩 | `supabase/functions/memory-compressor/index.ts` |
| 分层搜索 RPC | `supabase/migrations/20260127120000_tiered_memory_search.sql` |
| 前端 Hook | `src/hooks/useAICoachSession.ts` |
| 记忆展示 UI | `src/components/profile/MemoriesSection.tsx` |

---

## 技术细节（给程序看）

### TypeScript 内部函数清单

以下函数都在 `supabase/functions/get-system-instruction/index.ts` 中：

| 函数 | 行号 | 作用 |
|------|------|------|
| `getUserMemoriesTolan()` | ~1042 | **主入口**，执行四层检索 |
| `getUserMemoriesLegacy()` | ~930 | 传统检索（回退用） |
| `processMemoriesWithEventDate()` | ~613 | **时间感知**，处理带 event_date 的记忆 |
| `synthesizeQuestions()` | ~190 | LLM 生成检索问题 |
| `generateEmbeddings()` | ~280 | 批量生成向量嵌入 |
| `searchMemoriesInTier()` | ~430 | 在指定层级搜索记忆 |
| `mergeWithMRR()` | ~330 | MRR 融合算法排序 |
| `extractTaskKeywordsForHistory()` | ~153 | 提取关键词用于任务历史匹配 |
| `getTopicSeedQuestions()` | ~129 | 话题规则匹配 |
| `getSuccessRecords()` | ~730 | 获取用户成功记录 |

---

### 常量定义位置

在 `supabase/functions/get-system-instruction/index.ts` 第 27-39 行：

```typescript
// 记忆检索配置
const MEMORY_SIMILARITY_THRESHOLD = 0.5      // 核心层阈值
const EXTENDED_SIMILARITY_THRESHOLD = 0.3    // 扩展层阈值
const MEMORY_LIMIT_PER_QUERY = 5             // 每个查询返回的最大结果数
const MAX_FINAL_MEMORIES = 20                // 最终返回的最大记忆数
const EXTENDED_MEMORY_LIMIT = 5              // 扩展层数量限制
const TASK_HISTORY_LIMIT = 3                 // 任务历史数量限制

// 分层检索配置
const HOT_TIER_DAYS = 7          // 热层：最近 7 天访问过的记忆
const WARM_TIER_DAYS = 30        // 温层：7-30 天未访问的记忆
const MIN_HOT_RESULTS = 3        // 热层至少需要 3 条结果才算"够用"
const MIN_SIMILARITY_FOR_ENOUGH = 0.6  // 如果有一条相似度 >= 0.6，也算"够用"
const MIN_TAG_DIVERSITY = 2      // 至少 2 种不同标签才算"够用"
```

---

### 数据库表完整字段

表名：`user_memories`

```sql
CREATE TABLE user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,                    -- 记忆内容
  tag TEXT NOT NULL,                        -- PREF/PROC/SOMA/EMO/SAB/EFFECTIVE
  confidence FLOAT DEFAULT 0.5,             -- 置信度 (0-1)
  importance_score FLOAT DEFAULT 0.5,       -- 重要性评分 (0-1)
  task_name TEXT,                           -- 产生该记忆的任务名称
  embedding vector(1536),                   -- 向量嵌入
  metadata JSONB DEFAULT '{}',              -- 元数据
  access_count INTEGER DEFAULT 0,           -- 访问计数
  last_accessed_at TIMESTAMPTZ,             -- 最后访问时间
  merged_from UUID[],                       -- 合并来源追踪
  version INTEGER DEFAULT 1,                -- 记忆版本号
  superseded_by UUID,                       -- 被替代时指向新记忆
  compression_status TEXT DEFAULT 'active', -- active/compressed/deleted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### RPC 函数详细参数

#### `tiered_search_memories`

```sql
-- 位置：supabase/migrations/20260128111500_fix_tiered_search.sql
CREATE FUNCTION tiered_search_memories(
  p_user_id UUID,
  p_embeddings TEXT[],           -- JSON 字符串数组，每个是一个 embedding 向量
  p_threshold FLOAT DEFAULT 0.6, -- 相似度阈值
  p_limit_per_query INT DEFAULT 5,
  p_tier TEXT DEFAULT 'hot',     -- 'hot' | 'warm' | 'cold'
  p_hot_days INT DEFAULT 7,
  p_warm_days INT DEFAULT 30
)
RETURNS TABLE (
  memory_id UUID,
  content TEXT,
  tag TEXT,
  confidence FLOAT,
  importance_score FLOAT,
  similarity FLOAT,
  last_accessed_at TIMESTAMPTZ
)
```

#### `update_memory_access`

```sql
-- 位置：supabase/migrations/20260127120000_tiered_memory_search.sql
CREATE FUNCTION update_memory_access(p_memory_ids UUID[])
RETURNS VOID
-- 更新 last_accessed_at = NOW() 和 access_count += 1
```

---

### 话题规则配置

在 `get-system-instruction/index.ts` 第 69-124 行定义了 `TOPIC_RULES`：

```typescript
const TOPIC_RULES: TopicRule[] = [
  {
    id: 'travel',
    keywords: ['旅行', '旅游', '出门', '度假', '打包', '行李', 'packing', 'travel', 'trip'],
    memoryQuestions: [
      '用户之前去过哪些地方旅行？',
      '用户喜欢什么类型的旅行活动？',
      '用户旅行前通常有什么准备习惯或焦虑？',
      '用户通常和谁一起旅行？',
      '用户最近提到过什么旅行计划？',
    ],
  },
  {
    id: 'fitness',
    keywords: ['健身', '运动', '跑步', '锻炼', 'gym', 'workout', 'exercise'],
    memoryQuestions: [...],
  },
  {
    id: 'work',
    keywords: ['工作', '上班', '项目', '开会', 'deadline', 'work', 'meeting'],
    memoryQuestions: [...],
  },
  // ... 更多话题
]
```

---

### MRR 融合算法

在 `get-system-instruction/index.ts` 第 330-383 行的 `mergeWithMRR()` 函数：

```typescript
/**
 * Mean Reciprocal Rank (MRR) 融合算法
 * 分数 = Σ (1 / rank_i) 对于记忆出现的每个查询
 *
 * 例如: Memory A 在 Query1 排第1, Query3 排第2
 *       score = 1/1 + 1/2 = 1.5
 */
function mergeWithMRR(resultSets: MultiQueryResult[]): Array<{...}> {
  const scores = new Map<string, { mrrScore: number; ... }>()

  for (const result of resultSets) {
    const reciprocalRank = 1 / result.rank  // 排名的倒数
    // 累加分数...
  }

  // 按 MRR 分数排序（importance 作为次要排序）
  return sorted
}
```

---

### 向量相似度计算

PostgreSQL 使用 `pgvector` 扩展，相似度计算：

```sql
-- 余弦距离（越小越相似）
um.embedding <=> embedding_vector

-- 转换为相似度（0-1，越大越相似）
1 - (um.embedding <=> embedding_vector) AS similarity

-- 过滤条件
WHERE 1 - (um.embedding <=> embedding_vector) >= p_threshold
```

---

### 去重合并逻辑

在 `memory-extractor/index.ts` 中：

```typescript
// 1. 查询相似记忆
const { data: similar } = await supabase.rpc('search_similar_memories', {
  p_user_id: userId,
  p_embedding: embedding,
  p_threshold: 0.85,  // 高阈值，只匹配非常相似的
  p_limit: 3,
})

// 2. 如果找到相似记忆
if (similar && similar.length > 0) {
  // 调用 LLM 合并内容
  const merged = await mergeMemoriesWithLLM(newContent, similar[0].content)

  // 更新现有记忆
  await supabase.from('user_memories')
    .update({
      content: merged,
      merged_from: [...(similar[0].merged_from || []), newMemoryId],
      importance_score: Math.min(1, similar[0].importance_score + 0.1),
    })
    .eq('id', similar[0].id)
}
```

---

### 重要性评分计算

在 `memory-extractor/index.ts` 中：

```typescript
function calculateImportanceScore(tag: string, content: string, confidence: number): number {
  // 基础分数（按标签类型）
  const baseScores: Record<string, number> = {
    'PREF': 0.7,
    'EFFECTIVE': 0.8,
    'PROC': 0.5,
    'EMO': 0.5,
    'SAB': 0.5,
    'SOMA': 0.4,
  }

  let score = baseScores[tag] || 0.5

  // 调整因素
  if (confidence >= 0.8) score += 0.1
  if (content.match(/always|every time|never|总是|每次|从不/)) score += 0.1
  if (content.length > 100) score += 0.05

  return Math.min(1, score)
}
```

---

### 检索流程伪代码

```typescript
async function getUserMemoriesTolan(supabase, userId, taskDescription) {
  // 1. 偏好层：PREF + EFFECTIVE（始终加载）
  const prefMemories = await supabase
    .from('user_memories')
    .select('id, content, tag')
    .eq('user_id', userId)
    .eq('tag', 'PREF')
    .eq('compression_status', 'active')

  const effectiveMemories = await supabase
    .from('user_memories')
    .select('id, content, tag')
    .eq('tag', 'EFFECTIVE')
    .limit(5)

  // 2. 生成检索问题
  const seedQuestions = getTopicSeedQuestions(taskDescription)  // 话题匹配
  const questions = await synthesizeQuestions(taskDescription, seedQuestions)  // LLM 扩展
  const embeddings = await generateEmbeddings(questions)  // 向量化

  // 3. 核心层搜索（阈值 0.5）
  const coreResults = await supabase.rpc('tiered_search_memories', {
    p_user_id: userId,
    p_embeddings: embeddings.map(e => JSON.stringify(e)),
    p_threshold: 0.5,  // MEMORY_SIMILARITY_THRESHOLD
    p_tier: 'hot',
  })

  // 4. 扩展层搜索（阈值 0.3，只取 0.3-0.5 区间）
  const extendedResults = await supabase.rpc('tiered_search_memories', {
    p_threshold: 0.3,  // EXTENDED_SIMILARITY_THRESHOLD
  })
  const extendedFiltered = extendedResults
    .filter(r => r.similarity >= 0.3 && r.similarity < 0.5)
    .slice(0, 5)  // EXTENDED_MEMORY_LIMIT

  // 5. 任务历史搜索（按 task_name 模糊匹配）
  const keywords = extractTaskKeywordsForHistory(taskDescription)
  const historyMemories = await supabase
    .from('user_memories')
    .select('id, content, tag')
    .ilike('task_name', `%${keywords[0]}%`)
    .limit(3)  // TASK_HISTORY_LIMIT

  // 6. 合并去重 + 限制数量
  const allMemories = [...prefMemories, ...coreResults, ...extendedFiltered, ...historyMemories]
  const deduplicated = removeDuplicates(allMemories)
  return deduplicated.slice(0, 20)  // MAX_FINAL_MEMORIES
}
```

---

### 调试日志格式

检索成功时的日志输出：

```
🏷️ 任务 "整理行李" 匹配到话题: travel
🔍 Question Synthesis 生成 7 个检索问题: ["用户之前去过哪些地方旅行？", ...]
📊 成功生成 7 个 embeddings
🔍 [Tiered] 搜索 hot 层记忆...
🔍 [Tiered] hot 层返回 8 条结果
🧠 [Tolan] 偏好层: 3 条 (PREF + EFFECTIVE)
🧠 [Tolan] 核心层: 8 条 (≥0.5 相似度)
🌊 [Tiered] 开始扩展层搜索（阈值 0.3）...
🧠 [Tolan] 扩展层: 4 条 (0.3-0.5 相似度)
🔍 [Tiered] 任务历史搜索，关键词: 行李
🧠 [Tolan] 任务历史: 2 条 (task_name 匹配 "行李")
📅 查询 2 条 CONTEXT 记忆的 event_date...
📅 [event_date] 记忆 "用户计划1月30日去迪士尼..." 已过去 1 天，添加标注
📅 [event_date] 过滤了 1 条已过期超过 3 天的记忆
🧠 [记忆检索] 偏好: 3, 核心: 8, 扩展: 4, 任务历史: 2, 总计: 16, 耗时: 180ms
```
