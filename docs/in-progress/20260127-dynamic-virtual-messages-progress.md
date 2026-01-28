# 动态虚拟消息系统 - 当前进度与下一步计划

> 最后更新: 2026-01-27 22:50
> 状态: 话题检测方案需要重构

---

## 1. 问题背景

### 1.1 目标
在 AI 对话过程中，实时检测用户的话题/情绪变化，检索相关记忆，注入到对话中。

### 1.2 预期效果
```
用户说: "我男朋友可能不来了"
        ↓
系统检测到: 话题="感情问题", 情绪="sad"
        ↓
检索相关记忆: "用户之前因为男朋友的事情影响心情"
        ↓
注入 [CONTEXT] 消息到 Gemini Live
        ↓
AI 回复时自然引用这段记忆
```

### 1.3 相关文档
- 主方案文档: `docs/in-progress/20260127-dynamic-virtual-messages.md`
- 架构文档: `docs/architecture/memory-system.md`

---

## 2. 已完成的工作

### 2.1 ✅ 修复 isSpeaking 时序问题
**文件**: `src/hooks/gemini-live/useGeminiLive.ts`

**问题**:
- `turnComplete` 事件触发后，`isSpeakingRef` 还是 `true`
- 导致虚拟消息发送失败：`发送失败（不在安全窗口）`

**修复**:
```typescript
// 修复前：isSpeakingRef 通过 useEffect 异步同步，有延迟
onTurnComplete: () => {
  audioOutput.markTurnComplete();  // 异步更新 isSpeaking
  onTurnCompleteRef.current?.();   // 此时 isSpeakingRef 还是 true！
}

// 修复后：立即同步更新 ref
onTurnComplete: () => {
  audioOutput.markTurnComplete();
  isSpeakingRef.current = false;   // 立即更新
  onTurnCompleteRef.current?.();   // 此时 isSpeakingRef 已是 false
}
```

**验证**: 日志不再显示 `发送失败（不在安全窗口）`

---

### 2.2 ✅ 修复用户语音碎片化问题
**文件**: `src/hooks/useAICoachSession.ts`

**问题**:
- `onUserSpeech` 收到的是单词碎片：`"I'm"`, `"thinking"`, `"about"`
- 话题检测器无法从碎片中检测话题

**修复**:
```typescript
// 修复前：每个碎片都调用 onUserSpeech
if (lastMessage.role === 'user') {
  userSpeechBufferRef.current += lastMessage.text;
  orchestratorRef.current.onUserSpeech(lastMessage.text);  // 碎片
}

// 修复后：等用户说完整句话后再调用
if (lastMessage.role === 'assistant') {
  if (userSpeechBufferRef.current.trim()) {
    const fullUserMessage = userSpeechBufferRef.current.trim();
    orchestratorRef.current.onUserSpeech(fullUserMessage);  // 完整句子
    userSpeechBufferRef.current = '';
  }
}
```

**验证**: 日志显示 `🎤 用户说: 完整句子`

---

### 2.3 ✅ 会话开始时的记忆注入正常工作
**验证日志**:
```
🧠 [记忆检索] 本次会话取到的记忆:
1. User becomes resistant when the AI pushes...
2. User is planning a trip to Disneyland
3. User has a boyfriend who was originally supposed to come...
```

AI 回复中正确引用了这些记忆：
- "为**男朋友**的事烦心呢？"
- "是不是想明天**迪斯尼乐园**的行程啊？"
- "之前也尝试过**"只做一件小事"的方法**"

---

## 3. 当前问题

### 3.1 ❌ 话题检测不触发
**现象**: 每次 `turnComplete` 都显示 `queueSize: 0`

```
✅ [Orchestrator] turnComplete - 尝试发送队列消息 {queueSize: 0, isInCooldown: false}
```

没有看到以下日志：
- `🏷️ [Orchestrator] 话题变化`
- `🧠 [MemoryPipeline] 开始检索`
- `💗 [Orchestrator] 检测到强烈情绪，已入队 EMPATHY 消息`

### 3.2 根本原因：关键词匹配方式不可行

当前实现（`src/hooks/virtual-messages/useTopicDetector.ts`）使用关键词匹配：

```typescript
// constants.ts 中的关键词
{
  id: 'work',
  name: '工作',
  keywords: ['工作', '上班', '项目', '开会', 'deadline', '老板'],
}
```

**问题**:

| 用户说的话 | 预期话题 | 是否匹配 |
|-----------|---------|---------|
| "我还没做完事" | 工作 | ❌ 没有"工作"关键词 |
| "機票要不要取消" | 旅行 | ❌ 繁体"機票"不匹配简体"机票" |
| "boyfriend might not come" | 感情 | ❌ 英文不匹配中文关键词 |

### 3.3 备选方案评估

| 方案 | 可行性 | 原因 |
|------|-------|------|
| **关键词匹配** | ❌ 不可行 | 匹配率低，多语言困难 |
| **Function Calling** | ❌ 不可行 | Gemini Live API 有 bug，会断连 ([Issue #803](https://github.com/googleapis/python-genai/issues/803)) |
| **Semantic Router** | ✅ 推荐 | 语义匹配，多语言支持，快速便宜 |

---

## 4. 下一步计划：Semantic Router 方案

### 4.1 方案概述

用 embedding 向量相似度匹配，替代关键词匹配：

```
用户说: "我男朋友可能不来了"
        ↓
计算 embedding 向量
        ↓
与预定义话题的 embedding 做相似度匹配
        ↓
匹配到 "感情" 话题 (相似度 0.87)
        ↓
触发记忆检索
```

### 4.2 优点

- **多语言支持**: embedding 模型天然支持多语言
- **语义理解**: "他走了"和"分手"语义接近
- **快速便宜**: 一次 embedding 计算，比 LLM 调用便宜 100x
- **无 bug**: 不依赖 Gemini 的 Function Calling
- **高准确率**: 实际案例达到 92-96%

### 4.3 实现步骤

#### 步骤 1: 创建 Embedding Edge Function
**文件**: `supabase/functions/get-topic-embedding/index.ts`

```typescript
// 输入: 用户说的话
// 输出: embedding 向量 + 最匹配的话题

interface Request {
  text: string;
  userId: string;
}

interface Response {
  topic: string | null;      // 检测到的话题
  emotion: string;           // 检测到的情绪
  confidence: number;        // 置信度
  shouldRetrieveMemory: boolean;
}
```

#### 步骤 2: 预定义话题 embedding
**文件**: `supabase/functions/_shared/topic-embeddings.ts`

```typescript
// 每个话题有多个示例句子
const TOPIC_EXAMPLES = {
  relationship: [
    "我男朋友不来了",
    "boyfriend might not come",
    "分手了",
    "感情问题",
    "relationship issues",
  ],
  work: [
    "工作没做完",
    "deadline快到了",
    "还在加班",
    "work is stressful",
  ],
  // ... 更多话题
};

// 预计算这些句子的 embedding，存在内存或数据库中
```

#### 步骤 3: 修改前端调用
**文件**: `src/hooks/virtual-messages/useTopicDetector.ts`

```typescript
// 替换关键词匹配为 API 调用
const detectTopic = async (text: string) => {
  const response = await supabase.functions.invoke('get-topic-embedding', {
    body: { text, userId }
  });
  return response.data;
};
```

#### 步骤 4: 性能优化（可选）
- 客户端缓存最近的检测结果
- 使用 Web Worker 避免阻塞主线程
- 批量处理多条消息

### 4.4 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| Embedding 模型 | Google `textembedding-gecko@003` | 多语言支持，与现有 Supabase 集成 |
| 向量存储 | 内存 Map（话题少） | 话题数量 <20，不需要数据库 |
| 相似度计算 | 余弦相似度 | 标准做法 |

### 4.5 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `supabase/functions/get-topic-embedding/index.ts` | 新增 | Embedding API |
| `supabase/functions/_shared/topic-embeddings.ts` | 新增 | 预定义话题 |
| `src/hooks/virtual-messages/useTopicDetector.ts` | 修改 | 调用 API 替代关键词 |
| `src/hooks/virtual-messages/constants.ts` | 修改 | 移除关键词，改为话题示例 |

---

## 5. 当前状态总结

| 组件 | 状态 | 说明 |
|------|------|------|
| 虚拟消息发送 | ✅ 正常 | isSpeaking 时序问题已修复 |
| 用户语音处理 | ✅ 正常 | 完整句子传递给检测器 |
| 会话开始记忆注入 | ✅ 正常 | system instruction 中的记忆被 AI 引用 |
| **话题检测** | ❌ 不工作 | **需要用 Semantic Router 替换关键词匹配** |
| 实时记忆检索 | ⏸️ 待验证 | 依赖话题检测，话题检测修复后才能测试 |
| EMPATHY/CONTEXT 消息 | ⏸️ 待验证 | 依赖话题检测 |

---

## 6. 下一步行动

1. **创建 `get-topic-embedding` Edge Function**（本地开发）
2. **定义话题示例句子**（多语言）
3. **修改 `useTopicDetector.ts`** 调用新 API
4. **测试验证** 话题检测是否触发

---

## 7. 相关 Git 变更

已提交的修复：
- `src/hooks/gemini-live/useGeminiLive.ts` - isSpeaking 时序修复
- `src/hooks/useAICoachSession.ts` - 用户语音碎片化修复

待实现：
- Semantic Router 方案（上述步骤 1-4）
