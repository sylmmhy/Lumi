# 动态虚拟消息系统 - 当前进度与下一步计划

> 最后更新: 2026-01-28 22:00
> 状态: Semantic Router 方案已实现，待测试验证

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

### 2.4 ✅ Semantic Router 方案实现完成 (2026-01-28)

#### 问题回顾
原有的关键词匹配方式无法处理多语言和语义理解：

| 用户说的话 | 预期话题 | 关键词匹配 |
|-----------|---------|-----------|
| "我还没做完事" | 工作 | ❌ 没有"工作"关键词 |
| "機票要不要取消" | 旅行 | ❌ 繁体"機票"不匹配简体"机票" |
| "boyfriend might not come" | 感情 | ❌ 英文不匹配中文关键词 |

#### 解决方案：Semantic Router

使用 embedding 向量相似度匹配，替代关键词匹配：

```
用户说: "我男朋友可能不来了"
        ↓
计算 embedding 向量
        ↓
与预定义话题的 embedding 做相似度匹配
        ↓
匹配到 "感情问题" 话题 (相似度 87%)
        ↓
触发记忆检索
```

#### 已实现的文件

**后端（Lumi-supabase 仓库）**:

| 文件 | 说明 |
|------|------|
| `supabase/functions/_shared/topic-embeddings.ts` | 话题定义 + embedding 缓存 + 相似度匹配 |
| `supabase/functions/get-topic-embedding/index.ts` | Semantic Router API |

**前端（Lumi 仓库）**:

| 文件 | 说明 |
|------|------|
| `src/hooks/virtual-messages/types.ts` | 新增 `SemanticRouterResponse` 类型 |
| `src/hooks/virtual-messages/useTopicDetector.ts` | 重写为调用 API 的异步版本 |
| `src/hooks/virtual-messages/useVirtualMessageOrchestrator.ts` | 更新为使用异步 API |
| `src/hooks/virtual-messages/index.ts` | 更新导出和示例代码 |

#### API 接口

**请求**:
```json
POST /functions/v1/get-topic-embedding
{
  "text": "我男朋友可能不来了",
  "threshold": 0.65
}
```

**响应**:
```json
{
  "matched": true,
  "topic": {
    "id": "relationship_issue",
    "name": "感情问题"
  },
  "confidence": 0.87,
  "shouldRetrieveMemory": true,
  "emotion": "sad",
  "emotionIntensity": 0.7,
  "memoryQuestions": [
    "用户的感情状态如何？",
    "用户有什么感情相关的事情？"
  ],
  "durationMs": 150
}
```

#### 话题定义

已预定义 15 个话题，覆盖常见场景：

| 类别 | 话题 |
|------|------|
| 情感类 | 感情问题、失恋、压力、孤独 |
| 生活类 | 旅行、健身运动、美食 |
| 工作/学习类 | 工作、学习、写代码 |
| 社交类 | 朋友、家人 |
| 健康类 | 睡眠、健康 |

每个话题包含多语言示例句子（简体中文、繁体中文、英文）。

#### 使用方式

```typescript
// 旧版（同步，关键词匹配）
const result = topicDetector.detectFromMessage(text)

// 新版（异步，Semantic Router）
const result = await topicDetector.detectFromMessageAsync(text)
// 返回新增字段：confidence, shouldRetrieveMemory, memoryQuestions
```

---

## 3. 当前状态总结

| 组件 | 状态 | 说明 |
|------|------|------|
| 虚拟消息发送 | ✅ 正常 | isSpeaking 时序问题已修复 |
| 用户语音处理 | ✅ 正常 | 完整句子传递给检测器 |
| 会话开始记忆注入 | ✅ 正常 | system instruction 中的记忆被 AI 引用 |
| **话题检测** | ✅ 已实现 | **Semantic Router 方案已完成** |
| **实时记忆检索** | ⏸️ 待验证 | 依赖话题检测，需要测试验证 |
| **EMPATHY/CONTEXT 消息** | ⏸️ 待验证 | 依赖话题检测，需要测试验证 |

---

## 4. 下一步行动

### 4.1 启动本地 Supabase 测试
```bash
# 终端 1：启动后端
cd ../Lumi-supabase
npm run supabase:start
npm run supabase:functions

# 终端 2：启动前端
cd ../Lumi
npm run dev:local
```

### 4.2 测试用例

| 测试场景 | 用户说话 | 预期结果 |
|---------|---------|---------|
| 感情问题 | "我男朋友可能不来了" | 匹配 `relationship_issue`, confidence > 0.65 |
| 失恋 | "we broke up" | 匹配 `breakup`, emotion=sad |
| 旅行 | "明天要去打包行李" | 匹配 `travel` |
| 工作压力 | "deadline快到了好焦虑" | 匹配 `work` 或 `stress` |
| 无匹配 | "今天天气不错" | matched=false |

### 4.3 观察日志

成功时应该看到：
```
🎯 [TopicDetector] 匹配: 感情问题 (87.5%)
🏷️ [Orchestrator] 话题变化: 感情问题
🧠 [MemoryPipeline] 开始检索
🧠 [Orchestrator] 记忆检索完成，已入队 CONTEXT 消息
📤 [MessageQueue] 发送成功
🔇 [GeminiLive] 静默注入上下文
```

---

## 5. 相关 Git 变更

### 已提交的修复
- `src/hooks/gemini-live/useGeminiLive.ts` - isSpeaking 时序修复
- `src/hooks/useAICoachSession.ts` - 用户语音碎片化修复

### 新增文件（Semantic Router）
- `../Lumi-supabase/supabase/functions/_shared/topic-embeddings.ts`
- `../Lumi-supabase/supabase/functions/get-topic-embedding/index.ts`

### 修改文件（Semantic Router）
- `src/hooks/virtual-messages/types.ts`
- `src/hooks/virtual-messages/useTopicDetector.ts`
- `src/hooks/virtual-messages/useVirtualMessageOrchestrator.ts`
- `src/hooks/virtual-messages/index.ts`

---

## 6. 技术细节

### 6.1 Embedding 缓存策略

为避免每次请求都重新计算话题 embedding，采用以下策略：
1. 首次请求时批量计算所有话题的 embedding
2. 计算每个话题示例句子的平均 embedding 作为话题代表向量
3. 缓存到内存（Edge Function 冷启动时重新计算）

### 6.2 相似度阈值

| 阈值 | 用途 |
|------|------|
| 0.65 | 匹配阈值（低于此值视为未匹配） |
| 0.70 | 记忆检索阈值（高于此值才建议检索记忆） |

### 6.3 性能预期

| 操作 | 预期延迟 |
|------|---------|
| 首次请求（初始化缓存） | ~500ms |
| 后续请求 | ~100-200ms |
| 缓存命中（前端） | ~0ms |
