# 记忆系统调试进度报告

---
date: 2026-01-20
updated: 2026-01-20 17:15
stage: 🔧 进行中
---

## 阶段进度
- [x] 阶段 1：问题复现 - 确认记忆没有保存到数据库
- [x] 阶段 2：调查根因 - 发现前端竞态条件
- [x] 阶段 3：修复竞态条件 - 已修复并验证
- [ ] 阶段 4：解决 Embedding 失败 - **当前阶段**
- [ ] 阶段 5：完整功能验证

---

## 问题描述

用户反馈：AI 教练会话结束后，记忆没有被保存到数据库。

## 调查过程

### 第一个问题（已修复）：前端竞态条件

**症状**：
- 前端日志显示 `📤 [Mem0] 发送到 Mem0 的内容`
- 但没有显示 `✅ 会话记忆已保存` 或 `❌ 保存会话记忆失败`
- Edge Function 日志中没有 `memory-extractor` 的调用记录

**根因**：
`AppTabsPage.tsx` 中的代码存在竞态条件：
```javascript
// 问题代码
void aiCoach.saveSessionMemory({ forceTaskCompleted: false });  // 异步但不等待
aiCoach.endSession();  // 立即调用，触发 cleanup，中断网络请求
```

**修复**：
修改了 `src/pages/AppTabsPage.tsx` 的两处调用（行 890-900 和 909-930）：
```javascript
// 修复后
await aiCoach.saveSessionMemory({ forceTaskCompleted: false });
aiCoach.endSession();
```

**修复文档**：`docs/implementation-log/20260120-memory-save-race-condition-fix.md`

**验证**：修复后，前端日志显示 `✅ 会话记忆已保存`，说明 API 调用完成了。

---

### 第二个问题（当前）：Embedding 生成失败导致记忆未保存

**症状**：
- 前端日志显示：
  ```
  ✅ 会话记忆已保存: {extracted: 2, saved: 0, merged: 0, results: Array(0), memories: Array(2)}
  ```
- `extracted: 2` - AI 成功提取了 2 条记忆
- `saved: 0` - 但是没有保存到数据库
- 数据库 `user_memories` 表中该用户 (`c5eefa6f-1237-4f31-b467-1f49c3e8fea0`) 没有任何记录

**根因分析**：

在 `supabase/functions/memory-extractor/index.ts` 的 `saveOrMergeMemories` 函数中（行 470-496）：

```typescript
for (const memory of memories) {
  try {
    // 1. 生成 embedding
    const embedding = await generateEmbedding(memory.content)

    if (embedding.length === 0) {
      // 回退到简单插入（不做去重）
      // ...保存逻辑...
    }

    // 2. 查找相似记忆并保存/合并
    // ...
  } catch (err) {
    console.error(`Error processing memory: ...`, err)
    // ❌ 问题在这里：错误被捕获后，记忆被完全跳过，没有保存！
  }
}
```

如果 `generateEmbedding` 函数抛出异常（而不是返回空数组），整条记忆就被跳过了。

**根因确认（2026-01-20 17:30 通过数据库查询验证）**：

查询数据库发现：
```
所有现有记忆（8条）都 **没有 embedding**
最后一次成功保存记忆是 2026-01-08（12 天前）
```

这说明：之前的代码可能没有强制要求 embedding，但**现在的代码在 embedding 失败时会跳过保存**。

**失败流程**：
```
generateEmbedding() 抛异常
  → 进入 catch 块（行 586-588）
  → 只打印日志，不保存
  → 记忆丢失
```

**可能的异常原因**：

1. **AZURE_AI_API_KEY 环境变量未设置**
   - 代码行 227-229 会抛出 `AZURE_AI_API_KEY environment variable not set`

2. **Embedding 模型不可用**
   - `text-embedding-3-large` 可能在 Azure endpoint 上未部署
   - 代码行 246-250 会抛出 `Embedding request failed: {status}`

---

## 当前状态

| 项目 | 状态 | 证据 |
|------|------|------|
| 前端竞态条件修复 | ✅ 已完成 | 前端日志显示 API 调用完成 |
| API 调用到达服务器 | ✅ 已验证 | Supabase 日志显示 200 响应 |
| AI 提取记忆 | ✅ 工作正常 | `extracted: 2` |
| Embedding 生成 | ❌ **抛异常** | 数据库所有记忆都没有 embedding |
| 记忆保存到数据库 | ❌ **被跳过** | catch 块没有 fallback 保存逻辑 |

---

## 下一步行动

> **建议顺序**：先执行 **方案 A** 确认具体错误，再决定用 **方案 B** 或 **方案 C** 修复。

### 方案 A：查看详细日志确认问题（优先）

1. 打开 Supabase Dashboard：
   - URL: https://supabase.com/dashboard/project/ivlfsixvfovqitkajyjc/functions/memory-extractor/logs
2. 查找以下日志：
   - `Generating embedding for:` - 确认开始生成 embedding
   - `Embedding API error:` - 确认 API 是否返回错误
   - `Error processing memory:` - 确认是否有异常被捕获

### 方案 B：修复代码让 embedding 失败时也能保存（推荐）

修改 `supabase/functions/memory-extractor/index.ts:586-588` 的 catch 块：

**当前代码**：
```typescript
} catch (err) {
  console.error(`Error processing memory: ${memory.content.substring(0, 50)}...`, err)
  // ❌ 记忆被丢弃
}
```

**修复后**：
```typescript
} catch (err) {
  console.error(`Error processing memory: ${memory.content.substring(0, 50)}...`, err)

  // 🆕 fallback：即使 embedding 失败，也保存记忆（不做去重）
  try {
    const { data, error } = await supabase
      .from('user_memories')
      .insert({
        user_id: userId,
        content: memory.content,
        tag: memory.tag,
        confidence: memory.confidence,
        task_name: taskDescription || null,
        metadata: {
          ...metadata,
          embeddingFailed: true,
          embeddingError: String(err),
        },
      })
      .select()
      .single()

    if (data) {
      console.log(`Saved memory without embedding: ${data.id}`)
      results.push({ action: 'created', memoryId: data.id, content: memory.content })
      savedCount++
    } else if (error) {
      console.error('Fallback save failed:', error)
    }
  } catch (fallbackErr) {
    console.error('Fallback save exception:', fallbackErr)
  }
}
```

**优点**：
- 即使 embedding 失败，记忆也会被保存
- metadata 中会标记 `embeddingFailed: true`，方便后续排查
- 不影响正常流程（有 embedding 时仍然去重）

### 方案 C：检查 Azure AI 配置

1. 确认 `MEMORY_EMBEDDING_MODEL` 环境变量是否正确设置
2. 确认 `text-embedding-3-large` 模型在 Azure endpoint 上是否可用
3. 可以尝试换成其他 embedding 模型

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `src/pages/AppTabsPage.tsx:890-930` | 前端调用 saveSessionMemory 的地方（已修复） |
| `src/hooks/useAICoachSession.ts:697-848` | saveSessionMemory 实现 |
| `supabase/functions/memory-extractor/index.ts` | 后端记忆提取和保存逻辑 |
| `supabase/functions/memory-extractor/index.ts:226-254` | generateEmbedding 函数 |
| `supabase/functions/memory-extractor/index.ts:455-592` | saveOrMergeMemories 函数 |

---

## 测试用户信息

- User ID: `c5eefa6f-1237-4f31-b467-1f49c3e8fea0`
- 数据库中该用户无记忆记录
- 其他用户（如 `b58efaba-039e-4641-b61c-bb9688a09cca`）有正常的记忆记录

---

## 数据库表

- 表名：`user_memories`
- 项目 ID：`ivlfsixvfovqitkajyjc`
