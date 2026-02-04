---
title: "篝火专注陪伴模式"
created: 2026-02-03
updated: 2026-02-03 22:00
stage: "📐 设计"
due: 2026-02-10
issue: ""
---

# 篝火专注陪伴模式 实现进度

## 阶段进度
- [x] 阶段 1：需求分析
- [x] 阶段 2：方案设计
- [ ] 阶段 3：数据库设计
- [ ] 阶段 4：后端实现
- [ ] 阶段 5：前端实现
- [ ] 阶段 6：测试验证
- [ ] 阶段 7：文档更新

---

## 1. 背景与目标

### 背景
用户需要一个专注陪伴功能，在工作/学习时有火焰角色安静陪伴，需要时可以简短交流，但不会过多打扰。

### 挑战
- **Gemini 15分钟限制**：需要智能断开/重连
- **陪伴感**：用户不应感知到断开/重连
- **上下文延续**：重连后能接上之前的话题
- **专注辅助**：闲聊过多时温柔提醒回到专注

### 目标
1. 帮助用户保持专注
2. 在用户需要时提供简短支持
3. 温柔地减少分心
4. 记录专注时长和统计

---

## 2. 设计决策

| # | 问题 | 决策 |
|---|------|------|
| 1 | 摘要生成时机 | 先用消息，后台异步生成摘要 |
| 2 | 断开时体验 | 静默断开，用户无感知 |
| 3 | 重连开场 | 根据上下文自然接话 |
| 4 | 结束会话 | 离开页面清除上下文 |
| 5 | 白噪音 | 断开后继续播放，AI说话时降低音量 |
| 6 | 进入开场 | AI 主动问"准备好专注了吗？" |
| 7 | 长时间无互动 | 保持静默待机 |
| 8 | 对话风格 | 专注陪伴，闲聊过多温柔提醒 |
| 9 | 闲聊计数 | 整个专注期间累计 |
| 10 | 专注时长 | 用户自己决定何时结束 |
| 11 | 任务记录 | 新建 `focus_sessions` 表保存 |
| 12 | 进入时任务 | AI 会问，但用户可以跳过 |

---

## 3. 架构设计

### 3.1 状态流程图

```
用户进入篝火专注模式
       │
       ▼
┌──────────────────────────────────────────┐
│  🎯 开场 (Opening)                        │
│  - 连接 Gemini                            │
│  - AI: "准备好一起进入专注了吗？          │
│         今天想专注做什么？"                │
│  - 创建 focus_session 记录                │
└──────────────────────────────────────────┘
       │
   用户说出专注任务（或说"准备好了"/跳过）
       │
       ▼
┌──────────────────────────────────────────┐
│  🔥 专注中 (Focusing)                     │
│  - 断开 Gemini 连接（节省配额）            │
│  - 火焰安静陪伴，不主动说话               │
│  - 白噪音持续播放                         │
│  - 浏览器 VAD 监听用户语音                │
│  - 专注计时开始                           │
└──────────────────────────────────────────┘
       │
       ├── 用户开口说话 → VAD 触发
       │         │
       │         ▼
       │   ┌────────────────────────────────┐
       │   │  🔌 连接中 (Connecting)         │
       │   │  - 建立 Gemini Live 连接        │
       │   │  - 注入上下文摘要               │
       │   │  - 火焰轻微跳动表示"在听"       │
       │   └────────────────────────────────┘
       │         │
       │         ▼
       │   ┌────────────────────────────────┐
       │   │  💬 短暂交流 (Quick Chat)       │
       │   │  - 回答用户问题                 │
       │   │  - 简短鼓励                     │
       │   │  - 闲聊计数 +1                  │
       │   │  - 如果闲聊 ≥3 次 → 温柔提醒    │
       │   └────────────────────────────────┘
       │         │
       │         └── 30秒无对话 → 静默断开 → 回到专注中
       │
       └── 用户结束专注（离开页面 或 说"我结束了"）
                 │
                 ▼
       ┌──────────────────────────────────────┐
       │  🎉 结束 (Closing)                    │
       │  - AI: "做得很好！专注了 XX 分钟～"   │
       │  - 更新 focus_session 记录           │
       │  - 显示专注统计                       │
       │  - 清除内存上下文                     │
       └──────────────────────────────────────┘
```

### 3.2 连接超时策略

| 场景 | 超时时间 | 动作 |
|------|----------|------|
| AI 说完话后等待用户 | 30秒 | 静默断开 |
| 用户说话中停顿 | 3秒 | Gemini 自动处理 |
| 连接后用户没说话 | 15秒 | 静默断开 |
| 总连接时长 | 12分钟 | 主动断开（留 buffer） |

### 3.3 上下文管理

```typescript
interface CampfireContext {
  // 对话历史（最近 10 条，用于重连时注入）
  messages: Array<{
    role: 'user' | 'ai';
    text: string;
    timestamp: number;
  }>;
  
  // 对话摘要（后台异步生成）
  summary: string;
  
  // 聊过的话题
  topics: string[];
  
  // 连接统计
  connectionCount: number;
  lastDisconnectTime?: number;
}
```

### 3.4 闲聊检测与提醒

```typescript
// 闲聊计数（整个专注期间累计）
let distractionCount = 0;

// AI 回复策略
if (isOffTopic(userMessage)) {
  distractionCount++;
  
  if (distractionCount === 1) {
    // 正常回应，但简短
    return shortResponse;
  } else if (distractionCount === 2) {
    // 温柔提醒
    return response + " 聊得开心～不过你的任务还在等你哦";
  } else if (distractionCount >= 3) {
    // 更直接
    return "好啦好啦，先专注完再聊～我在这陪你";
  }
}
```

---

## 4. 数据库设计

### 4.1 `focus_sessions` 表

```sql
-- 专注会话记录表
CREATE TABLE focus_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 专注任务信息
  task_description TEXT,              -- 用户说的专注任务（可为空）
  
  -- 时间记录
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,           -- 总专注时长（秒）
  
  -- 状态
  status TEXT NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'completed', 'abandoned')),
  
  -- 统计
  chat_count INTEGER DEFAULT 0,       -- 对话次数
  distraction_count INTEGER DEFAULT 0, -- 闲聊/分心次数
  connection_count INTEGER DEFAULT 0,  -- Gemini 连接次数
  
  -- 元数据
  metadata JSONB DEFAULT '{}',        -- 对话摘要、话题等
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_focus_sessions_user_id ON focus_sessions(user_id);
CREATE INDEX idx_focus_sessions_started_at ON focus_sessions(started_at DESC);
CREATE INDEX idx_focus_sessions_status ON focus_sessions(status);

-- 更新时间触发器
CREATE TRIGGER update_focus_sessions_updated_at
  BEFORE UPDATE ON focus_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS 策略
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own focus sessions"
  ON focus_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own focus sessions"
  ON focus_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own focus sessions"
  ON focus_sessions FOR UPDATE
  USING (auth.uid() = user_id);
```

---

## 5. 后端设计

### 5.1 Edge Function: `start-campfire-focus`

**功能**：启动篝火专注会话，生成 System Prompt

**请求**：
```typescript
interface StartCampfireFocusRequest {
  userId: string;
  sessionId?: string;        // 可选，重连时传入
  context?: {
    summary?: string;        // 之前的对话摘要
    topics?: string[];       // 聊过的话题
    taskDescription?: string; // 专注任务
    distractionCount?: number; // 闲聊次数
    timeSinceLastChat?: number; // 距上次对话秒数
  };
}
```

**响应**：
```typescript
interface StartCampfireFocusResponse {
  success: boolean;
  sessionId: string;
  geminiConfig: {
    systemPrompt: string;
    voiceConfig: { voiceName: string };
  };
}
```

### 5.2 System Prompt 设计

```typescript
const CAMPFIRE_FOCUS_PROMPT = `
# 角色
你是 Lumi，篝火旁的专注陪伴伙伴。温暖、安静、像一个懂你的朋友。

# 场景
用户正在篝火旁专注工作/学习。你的任务是：
1. 帮助用户保持专注
2. 在用户需要时提供简短支持
3. 温柔地减少分心

${context.taskDescription ? `
# 用户当前专注的任务
${context.taskDescription}
` : ''}

${context.summary ? `
# 之前聊了什么
${context.summary}

# 聊过的话题
${context.topics?.join('、')}
` : ''}

${context.timeSinceLastChat > 60 ? `
用户刚才安静了 ${Math.floor(context.timeSinceLastChat / 60)} 分钟。
` : ''}

# 对话规则

## 开场（首次连接）
问用户："准备好一起进入专注了吗？今天想专注做什么？"
如果用户跳过或说"准备好了"，就直接开始陪伴。

## 重连时
自然地接话，不要说"我们刚才聊到..."
如果用户主动提起之前的话题，自然接上。

## 如果用户问问题或需要帮助
- 简短、有用地回答
- 回答后说"继续加油～"之类的鼓励

## 如果用户开始闲聊（与专注任务无关）
- 第 1-2 次：正常回应，但简短
- 第 3 次起：温柔提醒 "聊得开心～不过你的任务还在等你哦"
当前闲聊次数：${context.distractionCount || 0}

## 如果用户表达疲惫/想休息
- 理解并支持："累了就休息一下，火焰不会熄灭的"

## 如果用户说完成了/想结束
- 庆祝！"太棒了！你今天专注了很久呢～"

# 重要规则
- 回复要简短（1-2句话）
- 不要主动发起对话
- 语气温暖但不啰嗦
- 用用户说的语言回复
- 不要用 emoji（这是语音对话）
`;
```

### 5.3 Edge Function: `generate-focus-summary`

**功能**：异步生成对话摘要（后台调用）

**请求**：
```typescript
interface GenerateFocusSummaryRequest {
  messages: Array<{ role: string; text: string }>;
  existingSummary?: string;
}
```

**响应**：
```typescript
interface GenerateFocusSummaryResponse {
  summary: string;
  topics: string[];
}
```

---

## 6. 前端设计

### 6.1 文件结构

```
src/
├── pages/
│   └── CampfireFocusPage.tsx           # 主页面
│
├── hooks/
│   └── campfire/
│       ├── index.ts                     # 导出
│       ├── useCampfireSession.ts        # 会话管理（核心）
│       ├── useBrowserVAD.ts             # 浏览器端语音检测
│       ├── useAmbientAudio.ts           # 白噪音控制
│       └── useFocusTimer.ts             # 专注计时
│
├── components/
│   └── campfire/
│       ├── CampfireBackground.tsx       # 背景 + 火焰
│       ├── CampfireStatus.tsx           # 状态指示器
│       └── FocusCompleteModal.tsx       # 结束弹窗
```

### 6.2 核心 Hook: `useCampfireSession`

```typescript
interface CampfireSessionState {
  // 连接状态
  status: 'idle' | 'opening' | 'focusing' | 'connecting' | 'chatting' | 'closing';
  
  // 会话数据
  sessionId: string | null;
  taskDescription: string | null;
  
  // 计时
  focusStartTime: number | null;
  totalFocusSeconds: number;
  
  // 统计
  chatCount: number;
  distractionCount: number;
  connectionCount: number;
  
  // 上下文（内存中）
  context: CampfireContext;
  
  // Gemini 状态
  isConnected: boolean;
  isSpeaking: boolean;
}

interface UseCampfireSessionReturn {
  state: CampfireSessionState;
  
  // 动作
  startSession: () => Promise<void>;
  endSession: () => Promise<void>;
  setTaskDescription: (task: string) => void;
  
  // Gemini 相关
  isSpeaking: boolean;
}
```

### 6.3 浏览器 VAD: `useBrowserVAD`

```typescript
interface UseBrowserVADOptions {
  // 音量阈值（0-1）
  threshold?: number;
  // 触发延迟（持续多久算说话）
  minDuration?: number;
  // 是否启用
  enabled?: boolean;
}

interface UseBrowserVADReturn {
  // 是否检测到语音
  isVoiceActive: boolean;
  // 当前音量级别（0-1）
  volumeLevel: number;
  // 开始/停止监听
  start: () => void;
  stop: () => void;
}
```

### 6.4 白噪音控制: `useAmbientAudio`

```typescript
interface UseAmbientAudioOptions {
  src: string;              // 音频文件路径
  loop?: boolean;           // 循环播放
  fadeInDuration?: number;  // 淡入时长 (ms)
  fadeOutDuration?: number; // 淡出时长 (ms)
}

interface UseAmbientAudioReturn {
  isPlaying: boolean;
  volume: number;           // 0-1
  
  play: () => void;
  pause: () => void;
  setVolume: (v: number) => void;
  fadeToVolume: (v: number, duration?: number) => void;
}
```

### 6.5 UI 布局

```
┌──────────────────────────────────────────┐
│  ← 返回           [状态指示]  [🔊 音量]  │  顶部栏
├──────────────────────────────────────────┤
│                                          │
│                                          │
│          ☆  ✦  ★  ☆  ✦                  │  星空
│                                          │
│         🌲    🌲    🌲                   │  森林背景
│       🌲              🌲                 │
│                                          │
│               🔥                         │  TalkingFire
│             ════════                     │  篝火柴堆
│                                          │
├──────────────────────────────────────────┤
│                                          │
│          专注中 · 25:30                  │  专注计时
│                                          │
│         [ 结束专注 ]                     │  结束按钮
│                                          │
└──────────────────────────────────────────┘
```

### 6.6 状态指示器

| 状态 | 显示 |
|------|------|
| `idle` | （不显示） |
| `opening` | 🔌 连接中... |
| `focusing` | 🔥 专注中 |
| `connecting` | 🎤 正在听... |
| `chatting` | 💬 对话中 |
| `closing` | ✨ 结束中... |

---

## 7. 实现步骤

### Phase 1: 数据库
- [ ] 创建 `focus_sessions` 表
- [ ] 添加 RLS 策略
- [ ] 测试 CRUD

### Phase 2: 后端
- [ ] 创建 `start-campfire-focus` Edge Function
- [ ] 创建 `generate-focus-summary` Edge Function（可选）
- [ ] 测试 API

### Phase 3: 前端 Hooks
- [ ] `useBrowserVAD` - 浏览器端语音检测
- [ ] `useAmbientAudio` - 白噪音控制
- [ ] `useFocusTimer` - 专注计时
- [ ] `useCampfireSession` - 核心会话管理

### Phase 4: 前端 UI
- [ ] `CampfireFocusPage` - 主页面
- [ ] 集成 `TalkingFire` 组件
- [ ] 状态指示器
- [ ] 结束弹窗
- [ ] 添加到 DevTestPage 测试

### Phase 5: 优化
- [ ] VAD 灵敏度调优
- [ ] 断开/重连体验优化
- [ ] 白噪音音量自动调节
- [ ] 边界情况处理

---

## 8. 关键文件（待创建）

### 后端 (Lumi-supabase)
| 文件 | 作用 |
|------|-----|
| `supabase/migrations/xxx_create_focus_sessions.sql` | 数据库迁移 |
| `supabase/functions/start-campfire-focus/index.ts` | 启动会话 |
| `supabase/functions/generate-focus-summary/index.ts` | 生成摘要（可选） |

### 前端 (Lumi)
| 文件 | 作用 |
|------|-----|
| `src/pages/CampfireFocusPage.tsx` | 主页面 |
| `src/hooks/campfire/useCampfireSession.ts` | 会话管理 |
| `src/hooks/campfire/useBrowserVAD.ts` | 语音检测 |
| `src/hooks/campfire/useAmbientAudio.ts` | 白噪音 |
| `src/hooks/campfire/useFocusTimer.ts` | 计时器 |
| `src/components/campfire/CampfireBackground.tsx` | 背景组件 |
| `src/components/campfire/FocusCompleteModal.tsx` | 结束弹窗 |

---

## 9. 测试计划

### 功能测试
- [ ] 进入页面 → AI 开场白
- [ ] 说出任务 → 进入专注
- [ ] 专注中说话 → 触发连接 → 对话
- [ ] 30秒无对话 → 静默断开
- [ ] 重连后 → 上下文延续
- [ ] 闲聊 3 次 → 温柔提醒
- [ ] 说"结束" → 显示统计
- [ ] 离开页面 → 清除上下文

### 边界测试
- [ ] 网络断开 → 优雅降级
- [ ] 12分钟连接 → 主动断开
- [ ] 麦克风权限拒绝 → 提示
- [ ] 白噪音加载失败 → 静默失败

---

## 10. 待办事项

### 高优先级
- [ ] 创建数据库表
- [ ] 实现 `useBrowserVAD`
- [ ] 实现 `useCampfireSession`
- [ ] 基础 UI 页面

### 中优先级
- [ ] 白噪音音量自动调节
- [ ] 对话摘要生成
- [ ] 专注统计展示

### 低优先级
- [ ] 自定义白噪音
- [ ] 专注历史记录页
- [ ] 成就系统集成

---

## 11. 实现记录

### 2026-02-03
- ✅ 需求讨论，确定设计决策
- ✅ 完成架构设计文档
- 下一步：创建数据库表

---

**Author**: Claude & Sophia


//
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 篝火专注陪伴模式（Campfire Focus Companion）实现计划                                                                                            
                                                                                                                                                 
 概述                                                                                                                                            
                                                                                                                                                 
 实现篝火专注陪伴模式：用户专注工作时火焰安静陪伴，需要时可语音交流，30秒无对话自动断开节省配额。                                                
                                                                                                                                                 
 现有代码资产                                                                                                                                    
                                                                                                                                                 
 后端 (Lumi-supabase) - 已完成 ✅                                                                                                                
 ┌──────────────────────────────────────────────────────────────┬───────────┬───────────────────────────────────┐                                
 │                             文件                             │   状态    │               说明                │                                
 ├──────────────────────────────────────────────────────────────┼───────────┼───────────────────────────────────┤                                
 │ supabase/functions/start-campfire-focus/index.ts             │ ✅ 已完成 │ Edge Function，System Prompt 生成 │                                
 ├──────────────────────────────────────────────────────────────┼───────────┼───────────────────────────────────┤                                
 │ supabase/migrations/20260203100000_create_focus_sessions.sql │ ✅ 已完成 │ 数据库表 + RLS + 统计视图         │                                
 └──────────────────────────────────────────────────────────────┴───────────┴───────────────────────────────────┘                                
 前端 (Lumi) - 可复用                                                                                                                            
 ┌───────────────────────────┬────────────────────────────────────────┬───────────────────────┐                                                  
 │           模块            │                  文件                  │         用途          │                                                  
 ├───────────────────────────┼────────────────────────────────────────┼───────────────────────┤                                                  
 │ useGeminiLive             │ src/hooks/gemini-live/useGeminiLive.ts │ Gemini 连接/断开/消息 │                                                  
 ├───────────────────────────┼────────────────────────────────────────┼───────────────────────┤                                                  
 │ useVoiceActivityDetection │ src/hooks/useVoiceActivityDetection.ts │ 浏览器端 VAD          │                                                  
 ├───────────────────────────┼────────────────────────────────────────┼───────────────────────┤                                                  
 │ TalkingFire               │ src/components/ai/TalkingFire.tsx      │ 火焰动画              │                                                  
 ├───────────────────────────┼────────────────────────────────────────┼───────────────────────┤                                                  
 │ VoiceChatTest             │ src/components/dev/VoiceChatTest.tsx   │ 参考实现              │                                                  
 ├───────────────────────────┼────────────────────────────────────────┼───────────────────────┤                                                  
 │ fetchGeminiToken          │ src/hooks/gemini-live/index.ts         │ 获取 Token            │                                                  
 └───────────────────────────┴────────────────────────────────────────┴───────────────────────┘                                                  
 前端 (Lumi) - 需要创建 ❌                                                                                                                       
 ┌───────────────────────────────────────────────┬────────────┐                                                                                  
 │                     文件                      │    说明    │                                                                                  
 ├───────────────────────────────────────────────┼────────────┤                                                                                  
 │ src/hooks/campfire/useCampfireSession.ts      │ 核心状态机 │                                                                                  
 ├───────────────────────────────────────────────┼────────────┤                                                                                  
 │ src/hooks/campfire/useAmbientAudio.ts         │ 白噪音控制 │                                                                                  
 ├───────────────────────────────────────────────┼────────────┤                                                                                  
 │ src/hooks/campfire/useFocusTimer.ts           │ 专注计时   │                                                                                  
 ├───────────────────────────────────────────────┼────────────┤                                                                                  
 │ src/hooks/campfire/index.ts                   │ 导出       │                                                                                  
 ├───────────────────────────────────────────────┼────────────┤                                                                                  
 │ src/pages/CampfireFocusPage.tsx               │ 主页面     │                                                                                  
 ├───────────────────────────────────────────────┼────────────┤                                                                                  
 │ src/components/campfire/CampfireFocusView.tsx │ 核心 UI    │                                                                                  
 ├───────────────────────────────────────────────┼────────────┤                                                                                  
 │ src/components/campfire/FocusEndModal.tsx     │ 结束弹窗   │                                                                                  
 └───────────────────────────────────────────────┴────────────┘                                                                                  
 ---                                                                                                                                             
 状态机设计                                                                                                                                      
                                                                                                                                                 
 状态: idle → starting → active ⟷ focusing → ending → ended                                                                                      
                                                                                                                                                 
 idle:       未开始，显示入口                                                                                                                    
 starting:   获取麦克风、连接 Gemini、创建 DB 记录                                                                                               
 active:     Gemini 已连接，AI 对话中                                                                                                            
 focusing:   Gemini 已断开，VAD 监听中，火焰安静陪伴                                                                                             
 ending:     更新 DB、断开连接                                                                                                                   
 ended:      显示统计弹窗                                                                                                                        
                                                                                                                                                 
 状态转换规则                                                                                                                                    
 ┌─────────────────┬──────────┬───────────────────────────────────┐                                                                              
 │       从        │    到    │             触发条件              │                                                                              
 ├─────────────────┼──────────┼───────────────────────────────────┤                                                                              
 │ idle            │ starting │ 用户点击"开始专注"                │                                                                              
 ├─────────────────┼──────────┼───────────────────────────────────┤                                                                              
 │ starting        │ active   │ Gemini 连接成功                   │                                                                              
 ├─────────────────┼──────────┼───────────────────────────────────┤                                                                              
 │ active          │ focusing │ 30秒无对话 或 AI 说完用户确认任务 │                                                                              
 ├─────────────────┼──────────┼───────────────────────────────────┤                                                                              
 │ focusing        │ active   │ VAD 检测到用户说话                │                                                                              
 ├─────────────────┼──────────┼───────────────────────────────────┤                                                                              
 │ active/focusing │ ending   │ 用户点击结束 或 说"结束"          │                                                                              
 ├─────────────────┼──────────┼───────────────────────────────────┤                                                                              
 │ ending          │ ended    │ DB 更新完成                       │                                                                              
 └─────────────────┴──────────┴───────────────────────────────────┘                                                                              
 ---                                                                                                                                             
 实现步骤                                                                                                                                        
                                                                                                                                                 
 Phase 1: 基础 Hooks (优先级高)                                                                                                                  
                                                                                                                                                 
 1.1 useFocusTimer.ts                                                                                                                            
                                                                                                                                                 
 interface UseFocusTimerReturn {                                                                                                                 
   elapsedSeconds: number;                                                                                                                       
   formattedTime: string;  // "25:30"                                                                                                            
   start: () => void;                                                                                                                            
   stop: () => void;                                                                                                                             
   reset: () => void;                                                                                                                            
 }                                                                                                                                               
                                                                                                                                                 
 1.2 useAmbientAudio.ts                                                                                                                          
                                                                                                                                                 
 interface UseAmbientAudioReturn {                                                                                                               
   isPlaying: boolean;                                                                                                                           
   volume: number;                                                                                                                               
   play: () => void;                                                                                                                             
   pause: () => void;                                                                                                                            
   setVolume: (v: number) => void;                                                                                                               
   fadeToVolume: (v: number, duration?: number) => void;                                                                                         
 }                                                                                                                                               
 - 音频文件: public/campfire-sound.mp3 (已存在)                                                                                                  
 - AI 说话时降到 30% 音量                                                                                                                        
                                                                                                                                                 
 1.3 useCampfireSession.ts (核心)                                                                                                                
                                                                                                                                                 
 interface CampfireSessionState {                                                                                                                
   status: 'idle' | 'starting' | 'active' | 'focusing' | 'ending' | 'ended';                                                                     
   sessionId: string | null;                                                                                                                     
   taskDescription: string | null;                                                                                                               
   focusSeconds: number;                                                                                                                         
   chatCount: number;                                                                                                                            
   distractionCount: number;                                                                                                                     
   connectionCount: number;                                                                                                                      
 }                                                                                                                                               
                                                                                                                                                 
 interface UseCampfireSessionReturn {                                                                                                            
   state: CampfireSessionState;                                                                                                                  
   startSession: () => Promise<void>;                                                                                                            
   endSession: () => Promise<void>;                                                                                                              
   isSpeaking: boolean;  // AI 是否在说话                                                                                                        
 }                                                                                                                                               
                                                                                                                                                 
 关键逻辑:                                                                                                                                       
 1. 集成 useGeminiLive 管理连接                                                                                                                  
 2. 集成 useVoiceActivityDetection 触发重连                                                                                                      
 3. 30秒空闲计时器触发断开                                                                                                                       
 4. 重连时传入 context (messages, distractionCount)                                                                                              
                                                                                                                                                 
 Phase 2: UI 组件                                                                                                                                
                                                                                                                                                 
 2.1 CampfireFocusView.tsx                                                                                                                       
                                                                                                                                                 
 布局:                                                                                                                                           
 ┌──────────────────────────────────┐                                                                                                            
 │  ← 返回        [🔥 专注中]  🔊   │  顶部栏                                                                                                    
 ├──────────────────────────────────┤                                                                                                            
 │                                  │                                                                                                            
 │         🔥 TalkingFire          │  火焰 (居中)                                                                                                
 │                                  │                                                                                                            
 ├──────────────────────────────────┤                                                                                                            
 │          25:30                   │  计时器                                                                                                    
 │       [ 结束专注 ]               │  结束按钮                                                                                                  
 └──────────────────────────────────┘                                                                                                            
                                                                                                                                                 
 2.2 FocusEndModal.tsx                                                                                                                           
                                                                                                                                                 
 显示统计:                                                                                                                                       
 - 专注时长                                                                                                                                      
 - 对话次数                                                                                                                                      
 - "太棒了！" 鼓励                                                                                                                               
                                                                                                                                                 
 2.3 CampfireFocusPage.tsx                                                                                                                       
                                                                                                                                                 
 - 路由入口                                                                                                                                      
 - 状态管理                                                                                                                                      
 - 权限检查 (麦克风)                                                                                                                             
                                                                                                                                                 
 Phase 3: 集成                                                                                                                                   
                                                                                                                                                 
 1. 添加路由 /campfire                                                                                                                           
 2. 添加入口到 DevTestPage (测试)                                                                                                                
 3. 测试完整流程                                                                                                                                 
                                                                                                                                                 
 ---                                                                                                                                             
 关键文件路径                                                                                                                                    
                                                                                                                                                 
 需要创建 (前端 Lumi/)                                                                                                                           
                                                                                                                                                 
 - src/hooks/campfire/useCampfireSession.ts                                                                                                      
 - src/hooks/campfire/useAmbientAudio.ts                                                                                                         
 - src/hooks/campfire/useFocusTimer.ts                                                                                                           
 - src/hooks/campfire/index.ts                                                                                                                   
 - src/pages/CampfireFocusPage.tsx                                                                                                               
 - src/components/campfire/CampfireFocusView.tsx                                                                                                 
 - src/components/campfire/FocusEndModal.tsx                                                                                                     
 - src/components/campfire/index.ts                                                                                                              
                                                                                                                                                 
 需要修改 (前端 Lumi/)                                                                                                                           
                                                                                                                                                 
 - src/App.tsx - 添加路由                                                                                                                        
 - src/pages/DevTestPage.tsx - 添加测试入口                                                                                                      
                                                                                                                                                 
 参考文件                                                                                                                                        
                                                                                                                                                 
 - src/components/dev/VoiceChatTest.tsx - 语音对话实现参考                                                                                       
 - src/hooks/gemini-live/useGeminiLive.ts - Gemini API                                                                                           
 - src/hooks/useVoiceActivityDetection.ts - VAD                                                                                                  
                                                                                                                                                 
 ---                                                                                                                                             
 验证步骤                                                                                                                                        
                                                                                                                                                 
 1. 启动后端: cd Lumi-supabase && supabase functions serve --env-file supabase/.env.local                                                        
 2. 应用数据库迁移: npm run supabase:push:local                                                                                                  
 3. 启动前端: cd Lumi && npm run dev:local                                                                                                       
 4. 访问测试页: https://localhost:5173/dev                                                                                                       
 5. 测试流程:                                                                                                                                    
   - 点击"篝火专注" → AI 问"想专注做什么？"                                                                                                      
   - 回答后进入专注 → 火焰安静陪伴                                                                                                               
   - 说话 → 重连对话                                                                                                                             
   - 30秒无对话 → 静默断开                                                                                                                       
   - 点击结束 → 显示统计                                                                                                                         
                                                                                                                                                 
 ---                                                                                                                                             
 注意事项                                                                                                                                        
                                                                                                                                                 
 1. 复用 VoiceChatTest 的模式: 参考其 Gemini 连接、消息处理逻辑                                                                                  
 2. VAD 只在 focusing 状态启用: active 状态由 Gemini 自己处理                                                                                    
 3. context 传递: 重连时把 messages 和 distractionCount 传给后端                                                                                 
 4. 白噪音: AI 说话时 fadeToVolume(0.3)，说完后 fadeToVolume(1.0)                                                                                
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌