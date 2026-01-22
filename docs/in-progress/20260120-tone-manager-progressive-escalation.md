---
title: "ToneManager 渐进式语气升级系统"
created: 2026-01-20
updated: 2026-01-22
stage: "🧪 测试"
due: 2026-01-23
issue: ""
---

# ToneManager 渐进式语气升级系统

## 阶段进度
- [x] 阶段 1：需求分析
- [x] 阶段 2：方案设计
- [x] 阶段 3：核心实现（方案 B：延迟一轮 + 虚拟消息）
- [ ] 阶段 4：测试验证 ⬅️ 当前阶段
- [ ] 阶段 5：文档更新

---

## 1. 背景与目标

### 问题描述
原有的语气管理系统存在以下问题：
1. **语气变化不明显**：用户多次拒绝后，AI 的语气变化不够显著
2. **触发词时机问题**：之前的触发词方案失败，因为触发词在 AI 已经开始回复后才发送
3. **AI 不遵循指令**：System Instruction 太长（10000+ 字符），AI 容易忘记规则
4. **缺乏即时提醒**：AI 回复时没被提醒"你现在是第几次了"

### 最终方案：延迟一轮 + 虚拟消息

```
用户抗拒 → AI 回复 [RESIST] → 客户端 resistCount++ → 
下一轮用户说话 → 客户端发送虚拟消息 [TONE_INSTRUCTION] → AI 用正确语气回复
```

**关键点**：
- 第 1 次抗拒：AI 自己决定语气（可能不完美，这是预期的）
- 第 2 次开始：客户端发送虚拟消息，AI 收到明确指令
- 虚拟消息在用户说话时发送，在 AI 回复之前

---

## 2. 语气流程

```
第 1 次抗拒 → acknowledge_tiny（承认+超小步骤）
第 2 次抗拒 → curious_memory（好奇探索 或 提取成功记忆）
第 3 次抗拒 → tough_love（严厉模式）
第 4 次抗拒 → absurd_humor（荒谬幽默）
第 5 次抗拒 → tough_love（循环回严厉）
第 6 次抗拒 → absurd_humor（循环回幽默）
...以此类推，在 tough_love 和 absurd_humor 之间循环

特殊：[RESIST_EMO] → gentle（温和模式，覆盖其他）
重置：[ACTION] → 计数归零，回到 friendly
```

### 语气类型说明

| 语气 | Style | 描述 | 触发条件 |
|------|-------|------|----------|
| 友好开场 | `friendly` | 轻松、好奇、不推任务 | 默认 / [ACTION] 后重置 |
| 承认+超小步骤 | `acknowledge_tiny` | 不反驳，给极小步骤，不问为什么 | 第 1 次 [RESIST] |
| 好奇探索+记忆 | `curious_memory` | 问为什么 或 提醒成功 | 第 2 次 [RESIST] |
| 严厉推力 | `tough_love` | 直接、失望、倒数、无幽默 | 第 3、5、7... 次 [RESIST] |
| 荒谬幽默 | `absurd_humor` | 拟人化、搞笑挑战 | 第 4、6、8... 次 [RESIST] |
| 温和模式 | `gentle` | 超级温柔，零压力 | [RESIST_EMO]（情绪性抗拒）|

### curious_memory 的两种情况

**有成功记忆时（从 tasks 表提取）**：
- "你之前也做过这个呀，当时是怎么开始的？"
- "你已经坚持了 5 次了，这次也可以的。"
- "上次你也不想，但最后还是做完了，记得那种感觉吗？"

**没有成功记忆时**：
- "怎么了？今天是什么让这件事特别难？"
- "你有没有想过，做完之后会是什么感觉？"
- "好奇问一下，是什么在挡着你？"

---

## 3. 实现详情

### 3.1 核心文件

| 文件 | 作用 |
|------|-----|
| `src/hooks/useAICoachSession.ts` | 主逻辑：检测标记、计数、发送虚拟消息 |
| `supabase/functions/get-system-instruction/index.ts` | AI 系统指令：定义标记和语气 |

### 3.2 关键代码

**语气映射函数** (`useAICoachSession.ts`)：
```typescript
function getToneByResistCount(count: number): string {
  switch (count) {
    case 1: return 'acknowledge_tiny';
    case 2: return 'curious_memory';
    case 3: return 'tough_love';
    case 4: return 'absurd_humor';
    default:
      // 5次以上：在 tough_love 和 absurd_humor 之间循环
      return count % 2 === 1 ? 'tough_love' : 'absurd_humor';
  }
}
```

**新增的 refs**：
```typescript
const confirmedResistCountRef = useRef<number>(0);  // 确认的抗拒次数
const isEmotionalRef = useRef<boolean>(false);       // 是否情绪性抗拒
const lastToneRef = useRef<string>('friendly');      // 上一次语气（日志用）
```

**虚拟消息发送逻辑**（在用户说话时）：
```typescript
if (confirmedResistCountRef.current > 0 && geminiLive.isConnected) {
  const toneInstruction = generateToneInstruction(
    confirmedResistCountRef.current,
    isEmotionalRef.current,
    hasSuccessMemory,
    successMemoryHint
  );
  geminiLive.sendTextMessage(toneInstruction);
}
```

### 3.3 虚拟消息格式

```
[TONE_INSTRUCTION] resist_count=3 tone=tough_love

Use TOUGH LOVE mode. Be HARSH and DISAPPOINTED.
Sound impatient. Use countdown or direct commands. NO jokes. NO softening.

GOOD EXAMPLES:
- "够了。三、二、一。动。"
- "Enough. 3, 2, 1. Move."

BAD (DO NOT DO - VERY IMPORTANT):
- "你的床在哭" - This is HUMOR, absolutely BANNED!
- "我懂，但是..." - No softening!
```

---

## 4. 详细流程图

```
┌─────────────────────────────────────────────────────────────────────┐
│ 第 1 轮                                                              │
│ 用户: "不想做"                                                        │
│ (无虚拟消息，resistCount=0)                                           │
│ AI: "[RESIST] ..." (AI 自己决定，可能不完美)                           │
│ 客户端: 检测到 [RESIST]，resistCount = 1                              │
│ 日志: 🚫 AI 确认用户抗拒 (第 1 次)                                     │
│ 日志: 🔄 语气切换: 友好开场 → 承认+超小步骤                              │
├─────────────────────────────────────────────────────────────────────┤
│ 第 2 轮                                                              │
│ 用户: "还是不想"                                                      │
│ 客户端: resistCount=1，发送虚拟消息 [TONE_INSTRUCTION] acknowledge_tiny │
│ 日志: 📤 发送语气指令: resist=1, emotional=false, hasMemory=...       │
│ AI: "[RESIST] 我懂。那就站起来？" (收到指令，用正确语气)                 │
│ 客户端: 检测到 [RESIST]，resistCount = 2                              │
│ 日志: 🚫 AI 确认用户抗拒 (第 2 次)                                     │
│ 日志: 🔄 语气切换: 承认+超小步骤 → 好奇探索+记忆成功                      │
├─────────────────────────────────────────────────────────────────────┤
│ 第 3 轮                                                              │
│ 用户: "不要"                                                         │
│ 客户端: resistCount=2，发送虚拟消息 [TONE_INSTRUCTION] curious_memory  │
│ AI: "[RESIST] 怎么了？今天是什么让这件事变难了？" (正确语气)             │
│ 客户端: resistCount = 3                                              │
├─────────────────────────────────────────────────────────────────────┤
│ 第 4 轮                                                              │
│ 用户: "就是不想"                                                      │
│ 客户端: resistCount=3，发送虚拟消息 [TONE_INSTRUCTION] tough_love      │
│ AI: "[RESIST] 够了。三、二、一。动。" (正确语气)                        │
│ 客户端: resistCount = 4                                              │
├─────────────────────────────────────────────────────────────────────┤
│ 第 5 轮                                                              │
│ 用户: "..."                                                          │
│ 客户端: resistCount=4，发送虚拟消息 [TONE_INSTRUCTION] absurd_humor    │
│ AI: "[RESIST] 你的床在哭..." (正确语气)                               │
│ 客户端: resistCount = 5                                              │
├─────────────────────────────────────────────────────────────────────┤
│ 第 6 轮 (循环开始)                                                    │
│ 用户: "不"                                                           │
│ 客户端: resistCount=5，发送虚拟消息 [TONE_INSTRUCTION] tough_love      │
│ AI: "[RESIST] 现在。" (循环回严厉)                                    │
│ 客户端: resistCount = 6                                              │
├─────────────────────────────────────────────────────────────────────┤
│ 第 7 轮                                                              │
│ 用户: "不要"                                                         │
│ 客户端: resistCount=6，发送虚拟消息 [TONE_INSTRUCTION] absurd_humor    │
│ AI: "[RESIST] 我赌你连站都不敢..." (循环回幽默)                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. 成功记忆系统

### 5.1 数据来源

成功记忆从 `tasks` 表提取，条件：
- `status = 'completed'`
- `user_id = 当前用户`
- 任务类型匹配（通过关键词匹配）

### 5.2 提取的信息

```typescript
interface SuccessRecord {
  taskType: string;              // 任务类型 (workout, sleep, hygiene...)
  lastDuration: number | null;   // 上次做了多久
  lastDate: string | null;       // 上次完成日期
  currentStreak: number;         // 当前连胜天数
  totalCompletions: number;      // 总完成次数
  personalBest: number | null;   // 个人最佳时长
  recentSuccesses: Array<{       // 最近成功记录
    content: string;
    duration_minutes: number | null;
    overcame_resistance: boolean;
    completion_mood: string | null;
  }>;
}
```

### 5.3 如何使用

在第 2 次抗拒时（curious_memory 模式），如果有成功记忆：
- 虚拟消息会包含：`has_success_memory=true` 和具体数据
- AI 被指示提醒用户过去的成功

### 5.4 测试成功记忆

**方法 A：手动插入测试数据**
```sql
INSERT INTO tasks (user_id, title, status, completed_at, actual_duration_minutes, overcame_resistance, completion_mood)
VALUES (
  '你的user_id',
  'brush teeth',
  'completed',
  NOW(),
  5,
  true,
  'proud'
);
```

**方法 B：正常使用流程**
1. 完成一个任务（倒计时结束或点击完成）
2. 下次开始相同类型任务时，AI 会提取成功记忆

**验证日志**：
```
🏆 正在获取 hygiene 类型的成功记录（从 tasks 表）...
🏆 找到 X 条匹配的已完成任务
📤 [ToneManager] 发送语气指令: resist=2, emotional=false, hasMemory=true
```

---

## 6. 测试场景

### 场景 1：渐进式语气升级
1. 开始任务会话
2. 说："不想做"（第 1 次拒绝）
   - **预期日志**：
     - `🚫 [ToneManager] AI 确认用户抗拒 (第 1 次)`
     - `🔄 [ToneManager] 语气切换: 友好开场 → 承认+超小步骤`
   - **预期 AI 回复**：承认 + 超小步骤
   
3. 说："还是不想"（第 2 次拒绝）
   - **预期日志**：
     - `📤 [ToneManager] 发送语气指令: resist=1, emotional=false, hasMemory=...`
     - `🚫 [ToneManager] AI 确认用户抗拒 (第 2 次)`
     - `🔄 [ToneManager] 语气切换: 承认+超小步骤 → 好奇探索+记忆成功`
   - **预期 AI 回复**：问为什么 或 提醒成功
     
4. 说："不行"（第 3 次拒绝）
   - **预期日志**：`🔄 [ToneManager] 语气切换: ... → 严厉推力模式`
   - **预期 AI 回复**：严厉、倒数、命令，**无幽默**

5. 说："不要"（第 4 次拒绝）
   - **预期日志**：`🔄 [ToneManager] 语气切换: ... → 荒谬幽默模式`
   - **预期 AI 回复**：荒谬笑话、拟人化

6. 说："还是不"（第 5 次拒绝）
   - **预期日志**：`🔄 [ToneManager] 语气切换: ... → 严厉推力模式`
   - **预期 AI 回复**：**循环回严厉模式**

7. 说："不"（第 6 次拒绝）
   - **预期日志**：`🔄 [ToneManager] 语气切换: ... → 荒谬幽默模式`
   - **预期 AI 回复**：**循环回幽默模式**

### 场景 2：情绪分支测试
1. 拒绝两次后
2. 说："今天真的很难过，不想动"
   - **预期日志**：
     - `😢 [ToneManager] AI 检测到情绪性抗拒`
     - `🔄 [ToneManager] 语气切换: ... → 温和模式`
   - **预期 AI 回复**：温柔、零压力

### 场景 3：行动检测测试
1. 拒绝几次后
2. 说："好吧我起来了"
   - **预期日志**：
     - `🎉 [ToneManager] 用户开始行动！`
     - `🔄 [ToneManager] 语气重置: ... → 友好开场`
   - **预期 AI 回复**：积极反馈

---

## 7. 已知问题

### 7.1 循环逻辑疑问（待验证）

用户反馈循环可能有问题。当前逻辑：
```typescript
default:
  return count % 2 === 1 ? 'tough_love' : 'absurd_humor';
```

| count | count % 2 | 结果 |
|-------|-----------|------|
| 5 | 1 (奇数) | tough_love |
| 6 | 0 (偶数) | absurd_humor |
| 7 | 1 (奇数) | tough_love |
| 8 | 0 (偶数) | absurd_humor |

**待验证**：实际测试中循环是否正常工作。

### 7.2 第一次抗拒语气不可控

这是预期行为。因为第一次抗拒时：
- 客户端还没有 resistCount
- 虚拟消息还没发送
- AI 根据 System Instruction 自己决定语气

第二次开始才有虚拟消息指导。

---

## 8. 历史记录

### 2026-01-20：初始设计
- 设计渐进式语气升级流程
- 实现 useToneManager.ts

### 2026-01-21：触发词方案尝试
- 尝试使用触发词切换语气
- 发现时机问题：触发词在 AI 已开始回复后才发送

### 2026-01-22：方案 B 实现
- 改用"延迟一轮 + 虚拟消息"方案
- 在 useAICoachSession.ts 中实现：
  - 新增 `confirmedResistCountRef`、`isEmotionalRef`、`lastToneRef`
  - 新增 `getToneByResistCount()`、`generateToneInstruction()`
  - 在用户说话时发送虚拟消息（带成功记忆）
- 在 get-system-instruction 中添加 `[TONE_INSTRUCTION]` 说明

---

## 9. 待办事项

- [ ] 验证循环逻辑是否正常（第 5、6、7、8 次抗拒）
- [ ] 测试成功记忆提取（需要先有已完成任务数据）
- [ ] 确认 AI 遵循虚拟消息中的语气指令
- [ ] 完成测试后移动到 `implementation-log` 目录
