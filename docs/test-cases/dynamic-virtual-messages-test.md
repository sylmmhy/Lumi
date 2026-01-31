# 动态虚拟消息系统 - 测试用例

> 创建时间: 2026-01-29
> 目的: 验证 AI 是否按预期响应虚拟消息指令

---

## 测试前准备

### 1. 启动服务

```bash
# 终端 1：启动后端
cd ../Lumi-supabase
npm run supabase:start
npm run supabase:functions

# 终端 2：启动前端
cd ../Lumi
npm run dev:local
```

### 2. 打开浏览器开发者工具

- 按 `F12` 或 `Cmd+Option+I`
- 切换到 **Console** 标签
- 在 Filter 输入框中输入关键词过滤：`[Orchestrator]` 或 `[MessageQueue]`

### 3. 开始任务

- 登录账号
- 创建一个任务（如"写代码"或"整理房间"）
- 开始与 AI 对话

---

## 测试用例

### 测试 1: 情感话题 → 进入倾听模式

**场景**: 用户提到感情问题

**步骤**:
1. 开始任务后，对 AI 说：**"我男朋友可能不来了"**
2. 观察 AI 反应

**预期日志** (Console):
```
🎯 [TopicDetector] 匹配: 感情问题 (XX%)
🏷️ [Orchestrator] 话题变化: 感情问题
📥 [MessageQueue] 入队: LISTEN_FIRST (urgent)
📤 [MessageQueue] 发送成功: LISTEN_FIRST
🔇 [GeminiLive] 静默注入上下文
```

**预期 AI 行为**:
- ✅ AI **不会**催你做任务
- ✅ AI 会问"怎么了"或"发生什么事了"
- ✅ AI 进入倾听模式，表达关心

**❌ 失败表现**:
- AI 继续说"那我们开始任务吧"
- AI 忽略你的情感话题

---

### 测试 2: 失恋/高强度情绪 → 优先安慰

**场景**: 用户表达强烈情绪

**步骤**:
1. 对 AI 说：**"我们分手了，好难过"** 或 **"we broke up"**
2. 观察 AI 反应

**预期日志**:
```
🎯 [TopicDetector] 匹配: 失恋 (XX%)
💗 [Orchestrator] 检测到强烈情绪，已入队 EMPATHY 消息
📥 [MessageQueue] 入队: EMPATHY (urgent)
📤 [MessageQueue] 发送成功: EMPATHY
```

**预期 AI 行为**:
- ✅ AI 表达同理心："分手确实很难受"
- ✅ AI **完全不提**任务
- ✅ AI 说"我在这里陪你"之类的话

**❌ 失败表现**:
- AI 说"分手很难受，但任务还是要做的"
- AI 只说一句安慰就转回任务

---

### 测试 3: 明确拒绝 → 优雅接受

**场景**: 用户明确不想做任务

**步骤**:
1. 对 AI 说：**"算了，我真的不想做了"** 或 **"I don't want to do this anymore"**
2. 观察 AI 反应

**预期日志**:
```
🚫 AI 检测到 [RESIST] 标记
🔍 [ToneManager] 抗拒分析: {type: 'explicit_stop', action: 'accept_stop'}
📥 [MessageQueue] 入队: ACCEPT_STOP (high)
📤 [MessageQueue] 发送成功: ACCEPT_STOP
```

**预期 AI 行为**:
- ✅ AI 说"好的，没关系"或"那就休息一下"
- ✅ AI **不再坚持**让你做任务
- ✅ AI 可能询问"那你想聊点什么"

**❌ 失败表现**:
- AI 继续说"再试一次吧"
- AI 说"你可以的，加油"
- AI 不接受你的拒绝

---

### 测试 4: 找借口 → 推进小步骤

**场景**: 用户找借口但不是情感问题

**步骤**:
1. 对 AI 说：**"太累了，待会再说吧"** 或 **"有点困"**
2. 观察 AI 反应

**预期日志**:
```
🚫 AI 检测到 [RESIST] 标记
🔍 [ToneManager] 抗拒分析: {type: 'task_resistance', action: 'tiny_step'}
📥 [MessageQueue] 入队: PUSH_TINY_STEP (high)
```

**预期 AI 行为**:
- ✅ AI 说"那我们先做一小步？"
- ✅ AI 建议一个很小的行动
- ✅ AI 不会完全放弃

**❌ 失败表现**:
- AI 完全接受"那就休息吧"（应该稍微推一下）
- AI 变得很强硬"你必须做"

---

### 测试 5: 连续抗拒 → 语气切换

**场景**: 用户连续拒绝 2 次以上

**步骤**:
1. AI 建议做任务，你说：**"不想"**
2. AI 再建议，你再说：**"真的不想"**
3. 观察第 2 次后的 AI 反应

**预期日志**:
```
🔍 [ToneManager] 抗拒分析: {type: 'task_resistance', action: 'tone_shift', reason: '连续抗拒2次'}
📥 [MessageQueue] 入队: TONE_SHIFT (high)
📤 [MessageQueue] 发送成功: TONE_SHIFT
```

**预期 AI 行为**:
- ✅ AI 切换到更轻松的语气
- ✅ AI 可能开玩笑或用不同方式
- ✅ AI 不再用相同方式推你

---

### 测试 6: 旅行话题 → 记忆注入

**场景**: 用户提到旅行（假设有旅行相关记忆）

**步骤**:
1. 对 AI 说：**"我在想明天的行程"** 或 **"想去旅行"**
2. 观察 AI 反应

**预期日志**:
```
🎯 [TopicDetector] 匹配: 旅行 (XX%)
🏷️ [Orchestrator] 话题变化: 旅行
🧠 [MemoryPipeline] 开始检索
🧠 [Orchestrator] 记忆检索完成，已入队 CONTEXT 消息
📥 [MessageQueue] 入队: CONTEXT (normal)
```

**预期 AI 行为**:
- ✅ AI 引用你的过往旅行记忆（如果有）
- ✅ AI 像朋友一样聊天，如"上次你去迪士尼玩得很开心"

**注意**: 这个测试需要你的账号有旅行相关记忆

---

## 调试技巧

### 1. 快速过滤日志

在 Console 的 Filter 中输入：
- `[Orchestrator]` - 查看调度器日志
- `[MessageQueue]` - 查看消息队列
- `[TopicDetector]` - 查看话题检测
- `[ToneManager]` - 查看抗拒分析
- `[GeminiLive]` - 查看 AI 连接状态

### 2. 检查虚拟消息内容

在日志中搜索 `sendClientContent`，可以看到发送给 AI 的完整指令内容。

### 3. 手动触发记忆检索（开发者工具）

如果你想测试记忆检索但不想说话，可以在 Console 中执行：
```javascript
// 需要先在 React DevTools 中找到组件并暴露方法
window.triggerMemoryRetrieval?.('旅行', ['露营', '自驾'])
```

---

## 常见问题排查

### Q: 日志显示 `发送失败（不在安全窗口）`

**原因**: AI 正在说话时无法注入消息
**解决**: 等 AI 说完话后会自动重试

### Q: 日志显示 `sendClientContent 失败: session.send 不可用`

**原因**: Gemini 连接可能断开
**解决**: 检查网络，或重新开始任务

### Q: 话题检测 confidence 太低，没有触发

**原因**: 用户说的话与预定义话题不够相似
**解决**: 尝试更直接的表达，如直接说"我失恋了"而不是间接表达

### Q: AI 没有按预期行为反应

可能原因：
1. 虚拟消息没有成功发送（检查日志）
2. System Prompt 中的规则与虚拟消息冲突
3. AI 没有正确理解指令格式

---

## 测试结果记录表

| 测试用例 | 日期 | 结果 | 备注 |
|---------|------|------|------|
| 测试 1: 情感话题 | | ☐ 通过 / ☐ 失败 | |
| 测试 2: 失恋/高强度情绪 | | ☐ 通过 / ☐ 失败 | |
| 测试 3: 明确拒绝 | | ☐ 通过 / ☐ 失败 | |
| 测试 4: 找借口 | | ☐ 通过 / ☐ 失败 | |
| 测试 5: 连续抗拒 | | ☐ 通过 / ☐ 失败 | |
| 测试 6: 旅行话题记忆注入 | | ☐ 通过 / ☐ 失败 | |

---

## 后续优化方向

如果测试发现问题，可以调整：
1. **话题检测阈值**: `../Lumi-supabase/supabase/functions/_shared/topic-embeddings.ts`
2. **抗拒分析逻辑**: `src/hooks/useToneManager.ts` 的 `analyzeResistance()`
3. **System Prompt**: `../Lumi-supabase/supabase/functions/get-system-instruction/index.ts`
4. **虚拟消息内容**: `src/hooks/virtual-messages/useVirtualMessageOrchestrator.ts`
