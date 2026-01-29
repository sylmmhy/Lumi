# 动态虚拟消息系统 - 当前进度与下一步计划

> 最后更新: 2026-01-28 23:30
> 状态: System Prompt 重构 + 抗拒分析联动已实现，待测试验证

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

### 2.5 ✅ System Prompt + 虚拟消息架构重构 (2026-01-28)

#### 问题回顾

原有的 AI 行为控制方式是"硬编码在 System Prompt"中：
- `TASK COMMITMENT: Stay persistent`（坚持推任务）
- `Phrases to avoid: "It is okay to skip"`（禁止说"不做也没关系"）

这导致 AI 在用户有情感需求时仍然推任务，缺乏同理心。

#### 解决方案：动态指令系统

将 AI 行为控制从"硬编码"改为"通过虚拟消息动态注入"：

```
用户说: "我男朋友可能不来了"
        ↓
[RESIST] 检测到
        ↓
analyzeResistance() 分析: type=emotional, action=listen
        ↓
发送 [LISTEN_FIRST] 虚拟消息
        ↓
AI 进入倾听模式，不推任务
```

#### 已实现的改动

**1. 新增 5 种虚拟消息类型**

| 类型 | 用途 | 优先级 |
|------|------|--------|
| `LISTEN_FIRST` | 进入倾听模式，用户想聊情感 | urgent |
| `GENTLE_REDIRECT` | 情绪稳定后轻柔引导回任务 | high |
| `ACCEPT_STOP` | 用户明确不想做，优雅接受 | high |
| `PUSH_TINY_STEP` | 非情感抗拒，推进小步骤 | high |
| `TONE_SHIFT` | 语气切换（从 ToneManager 触发） | high |

**文件**: `src/hooks/virtual-messages/types.ts`

**2. 新增 analyzeResistance() 函数**

分析用户抗拒类型并返回建议动作：

```typescript
// 分析逻辑
1. 检测到情感话题 (relationship, breakup, stress) → type: 'emotional'
   - 高强度 (≥0.7) → suggestedAction: 'empathy'
   - 低强度 (<0.7) → suggestedAction: 'listen'
2. 明确说"不想做"、"算了" → type: 'explicit_stop', action: 'accept_stop'
3. 其他借口 → type: 'task_resistance'
   - 连续抗拒 2+ 次 → action: 'tone_shift'
   - 否则 → action: 'tiny_step'
```

**文件**: `src/hooks/useToneManager.ts`

**3. 重构 System Prompt**

| 改动 | 说明 |
|------|------|
| 移除 | `TASK COMMITMENT` 规则、`Phrases to avoid` |
| 新增 | `<dynamic_instruction_system>` - 说明如何响应动态指令 |
| 新增 | `<default_behavior>` - 无指令时的温和默认行为 |
| 更新 | `<boundaries>` - 改为"尊重用户意愿" |

**文件**: `../Lumi-supabase/supabase/functions/get-system-instruction/index.ts`

关键变化：
```diff
- TASK COMMITMENT: Stay persistent.
- Phrases to avoid: "It is okay to skip"
+ RESPECT USER AGENCY: If they say "not now", accept it gracefully.
+ <default_behavior>
+ If user seems upset, ASK before assuming they need task help
+ </default_behavior>
```

**4. 实现 ToneManager → 虚拟消息联动**

当检测到 `[RESIST]` 标记时：

```typescript
// useAICoachSession.ts
if (hasResistTag) {
  const analysis = analyzeResistance(userMessage, topicResult, consecutiveRejections);

  switch (analysis.suggestedAction) {
    case 'empathy':
    case 'listen':
      orchestrator.sendMessageForAction(analysis.suggestedAction);
      break;
    case 'accept_stop':
      orchestrator.sendMessageForAction('accept_stop');
      break;
    case 'tiny_step':
      orchestrator.sendMessageForAction('tiny_step');
      break;
    case 'tone_shift':
      toneManager.recordResistance('ai_detected');  // 触发语气切换
      break;
  }
}
```

**文件**: `src/hooks/useAICoachSession.ts`

**5. 新增消息生成函数**

**文件**: `src/hooks/virtual-messages/useVirtualMessageOrchestrator.ts`

```typescript
// 新增函数
generateListenFirstMessage()    // [LISTEN_FIRST] 消息
generateGentleRedirectMessage() // [GENTLE_REDIRECT] 消息
generateAcceptStopMessage()     // [ACCEPT_STOP] 消息
generatePushTinyStepMessage()   // [PUSH_TINY_STEP] 消息
sendMessageForAction(action)    // 根据 action 发送对应消息
sendGentleRedirect()            // 发送温柔引导消息
```

**6. 降低话题检测阈值**

**文件**: `../Lumi-supabase/supabase/functions/_shared/topic-embeddings.ts`

| 阈值 | 原值 | 新值 | 说明 |
|------|------|------|------|
| 匹配阈值 | 0.65 | **0.55** | 捕获更多间接表达 |
| 记忆检索阈值 | 0.70 | **0.65** | 更积极地检索记忆 |

同时为情感话题增加间接表达示例：
- `relationship_issue`: "he might not come", "plans might change", "他可能不来了"
- `stress`: "too much to do", "my head is spinning", "好多事情要处理"
- `loneliness`: "home alone", "no one to talk to", "一个人在家"

---

### 2.6 ✅ 修复 sendClientContent 返回值问题 (2026-01-28)

#### 问题

`turnComplete` 时尝试发送消息，但 `session.send` 可能不可用：

```
✅ [Orchestrator] turnComplete - 尝试发送队列消息
⚠️ [GeminiSession] sendClientContent 失败: session.send 不可用
🔇 [GeminiLive] 静默注入上下文: ...  ← 误报为成功！
📤 [MessageQueue] 发送成功               ← 误报为成功！
```

#### 修复

**1. sendClientContent 返回 boolean**

```typescript
// 修复前
const sendClientContent = useCallback((content, turnComplete) => {
  if (session && typeof session.send === 'function') {
    session.send(...);
  }
}, []);

// 修复后
const sendClientContent = useCallback((content, turnComplete): boolean => {
  if (session && typeof session.send === 'function') {
    session.send(...);
    return true;
  }
  return false;
}, []);
```

**文件**: `src/hooks/gemini-live/core/useGeminiSession.ts`

**2. injectContextSilently 检查返回值**

```typescript
// 修复前
session.sendClientContent(content, false);
console.log('🔇 静默注入上下文');  // 无论成功失败都打印
return true;

// 修复后
const success = session.sendClientContent(content, false);
if (!success) {
  console.warn('⚠️ 静默注入失败');
  return false;
}
console.log('🔇 静默注入上下文');
return true;
```

**文件**: `src/hooks/gemini-live/useGeminiLive.ts`

---

## 3. 当前状态总结

| 组件 | 状态 | 说明 |
|------|------|------|
| 虚拟消息发送 | ✅ 正常 | isSpeaking 时序 + sendClientContent 返回值已修复 |
| 用户语音处理 | ✅ 正常 | 完整句子传递给检测器 |
| 会话开始记忆注入 | ✅ 正常 | system instruction 中的记忆被 AI 引用 |
| **话题检测** | ✅ 已实现 | Semantic Router 方案已完成，阈值已降低 |
| **抗拒分析** | ✅ 已实现 | analyzeResistance() 函数 |
| **动态指令系统** | ✅ 已实现 | System Prompt 重构完成 |
| **新消息类型** | ✅ 已实现 | LISTEN_FIRST, ACCEPT_STOP, PUSH_TINY_STEP 等 |
| **实时记忆检索** | ⏸️ 待验证 | 依赖话题检测，需要测试验证 |
| **联动逻辑** | ⏸️ 待验证 | ToneManager → 虚拟消息联动待测试 |

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

### 4.2 测试用例 - 话题检测

| 测试场景 | 用户说话 | 预期结果 |
|---------|---------|---------|
| 感情问题 | "我男朋友可能不来了" | 匹配 `relationship_issue`, confidence > 0.55 |
| 感情问题（间接） | "he might not come" | 匹配 `relationship_issue` |
| 失恋 | "we broke up" | 匹配 `breakup`, emotion=sad |
| 旅行 | "明天要去打包行李" | 匹配 `travel` |
| 工作压力 | "deadline快到了好焦虑" | 匹配 `work` 或 `stress` |
| 无匹配 | "今天天气不错" | matched=false |

### 4.3 测试用例 - 抗拒分析 + 虚拟消息

| 用户说 | 预期分析 | 预期消息 |
|-------|----------|---------|
| "我男朋友可能不来了" | type=emotional, action=listen | [LISTEN_FIRST] |
| "I don't want to do this anymore" | type=explicit_stop, action=accept_stop | [ACCEPT_STOP] |
| "太累了，待会再说" | type=task_resistance, action=tiny_step | [PUSH_TINY_STEP] |
| 连续抗拒 2+ 次（非情感） | type=task_resistance, action=tone_shift | [TONE_SHIFT] |

### 4.4 观察日志 - 完整流程

**话题检测 + 记忆检索**:
```
🎯 [TopicDetector] 匹配: 感情问题 (58%)
🏷️ [Orchestrator] 话题变化: 感情问题
🧠 [MemoryPipeline] 开始检索
🧠 [Orchestrator] 记忆检索完成，已入队 CONTEXT 消息
📤 [MessageQueue] 发送成功
📥 [GeminiSession] sendClientContent (turnComplete=false): [CONTEXT]...
🔇 [GeminiLive] 静默注入上下文
```

**抗拒分析 + 虚拟消息**:
```
🚫 AI 检测到 [RESIST] 标记
🔍 [ToneManager] 抗拒分析: {type: 'emotional', action: 'listen', reason: '检测到情感话题'}
📥 [MessageQueue] 入队: LISTEN_FIRST (urgent)
📤 [MessageQueue] 发送成功: LISTEN_FIRST
📥 [GeminiSession] sendClientContent (turnComplete=false): [LISTEN_FIRST]...
🔇 [GeminiLive] 静默注入上下文
```

**发送失败（session 不可用）**:
```
✅ [Orchestrator] turnComplete - 尝试发送队列消息 {queueSize: 1}
⚠️ [GeminiSession] sendClientContent 失败: session.send 不可用
⚠️ [GeminiLive] 静默注入失败: sendClientContent 返回 false
⏸️ [MessageQueue] 发送失败（不在安全窗口）: PUSH_TINY_STEP
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

### 修改文件（System Prompt + 抗拒分析重构，2026-01-28）

**前端（Lumi 仓库）**:

| 文件 | 改动 |
|------|------|
| `src/hooks/virtual-messages/types.ts` | 新增 5 种消息类型 |
| `src/hooks/useToneManager.ts` | 新增 `analyzeResistance()` 函数 + 相关类型 |
| `src/hooks/useAICoachSession.ts` | 实现抗拒分析 → 虚拟消息联动逻辑 |
| `src/hooks/virtual-messages/useVirtualMessageOrchestrator.ts` | 新增消息生成函数 + sendMessageForAction |
| `src/hooks/gemini-live/core/useGeminiSession.ts` | sendClientContent 返回 boolean |
| `src/hooks/gemini-live/useGeminiLive.ts` | injectContextSilently 检查返回值 |

**后端（Lumi-supabase 仓库）**:

| 文件 | 改动 |
|------|------|
| `supabase/functions/get-system-instruction/index.ts` | 重构 System Prompt（移除硬编码规则，添加动态指令系统） |
| `supabase/functions/_shared/topic-embeddings.ts` | 降低阈值 + 增加间接表达示例 |

---

## 6. 技术细节

### 6.1 Embedding 缓存策略

为避免每次请求都重新计算话题 embedding，采用以下策略：
1. 首次请求时批量计算所有话题的 embedding
2. 计算每个话题示例句子的平均 embedding 作为话题代表向量
3. 缓存到内存（Edge Function 冷启动时重新计算）

### 6.2 相似度阈值（已更新）

| 阈值 | 原值 | 新值 | 用途 |
|------|------|------|------|
| 匹配阈值 | 0.65 | **0.55** | 低于此值视为未匹配 |
| 记忆检索阈值 | 0.70 | **0.65** | 高于此值才建议检索记忆 |

### 6.3 抗拒分析决策树

```
用户抗拒 ([RESIST] 检测到)
    ↓
检查话题检测结果 (topicResult)
    ↓
┌─ 情感类话题 (relationship, breakup, stress, loneliness)
│   ├─ emotionIntensity ≥ 0.7 → action: 'empathy' → [EMPATHY] 消息
│   └─ emotionIntensity < 0.7 → action: 'listen'  → [LISTEN_FIRST] 消息
│
├─ 明确拒绝关键词 ("不想", "算了", "don't want", "give up")
│   └─ action: 'accept_stop' → [ACCEPT_STOP] 消息
│
└─ 其他 (普通任务抗拒)
    ├─ consecutiveRejections ≥ 2 → action: 'tone_shift' → [TONE_SHIFT] 消息
    └─ consecutiveRejections < 2 → action: 'tiny_step'  → [PUSH_TINY_STEP] 消息
```

### 6.4 动态指令消息格式

| 指令 | 格式 |
|------|------|
| `[LISTEN_FIRST]` | `language=XX\nuser_context: "..."\ntopic: ...\naction: 进入倾听模式...` |
| `[GENTLE_REDIRECT]` | `elapsed=Xm language=XX\naction: 用户情绪稳定了...` |
| `[ACCEPT_STOP]` | `language=XX\naction: 用户明确不想继续...` |
| `[PUSH_TINY_STEP]` | `language=XX\nuser_said: "..."\ntask: ...\naction: 用户在找借口...` |
| `[TONE_SHIFT]` | `style=X current_time=HH:MM language=XX` |

### 6.3 性能预期

| 操作 | 预期延迟 |
|------|---------|
| 首次请求（初始化缓存） | ~500ms |
| 后续请求 | ~100-200ms |
| 缓存命中（前端） | ~0ms |
