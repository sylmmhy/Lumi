# 🎤 Start Voice Chat API (Gemini Live 版本)

## 概述

用户主动发起语音对话的 API，使用 **Gemini Live API** 实现实时语音交互。

## 端点

```
POST /functions/v1/start-voice-chat
```

## 请求参数

```typescript
interface StartVoiceChatRequest {
  userId: string           // 必需：用户 ID
  sessionId?: string       // 可选：会话 ID（不传则自动生成）
  
  // 对话类型
  chatType: 'intention_compile' | 'daily_chat' | 'habit_checkin' | 'goal_review'
  
  // 上下文信息
  context?: {
    phase?: 'onboarding' | 'goal' | 'routines' | 'confirm' | 'daily'
    goalId?: string
    goalType?: string        // sleep / wake / exercise
    goalName?: string        // 目标名称，如"早睡"
    currentTargetTime?: string
    ultimateTargetTime?: string
    routines?: Array<{ name: string; durationMinutes: number; isCutoff?: boolean }>
    schedule?: Array<{ time: string; name: string; emoji: string }>
    userName?: string
  }
  
  // AI 语气偏好
  aiTone?: 'gentle' | 'direct' | 'humorous' | 'tough_love'
}
```

## 响应

```typescript
interface StartVoiceChatResponse {
  success: boolean
  sessionId?: string
  geminiConfig?: {
    apiKey: string       // Gemini API Key
    model: string        // 模型名称
    systemPrompt: string // 根据对话类型生成的 System Prompt
    voiceConfig: {
      voiceName: string  // 语音名称
    }
  }
  error?: string
}
```

## 对话类型和阶段

### intention_compile（执行意图编译）

| phase | 说明 | AI 行为 |
|-------|------|---------|
| `onboarding` | 首次使用 | "你最近有什么想改善的吗？" |
| `goal` | 收集目标 | 追问目标时间、当前习惯、睡眠时长 |
| `routines` | 收集习惯 | 追问睡前习惯和时长 |
| `confirm` | 确认计划 | 展示时间表，等待确认 |
| `daily` | 日常确认 | "今天还是按之前的时间吗？" |

### daily_chat（日常对话）

根据用户是否有目标：
- 有目标 → "今天的 XX 计划想怎么安排？"
- 无目标 → "今天怎么样？有什么想聊的吗？"

### habit_checkin（习惯打卡）

确认今日完成情况，鼓励用户。

### goal_review（目标回顾）

回顾目标进度，建议调整。

## 前端使用示例

### 1. 调用 API 获取配置

```typescript
const startVoiceChat = async (chatType: string, context?: any) => {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/start-voice-chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        userId: currentUser.id,
        chatType,
        context,
        aiTone: 'gentle',
      }),
    }
  );

  return await response.json();
};
```

### 2. 使用 Gemini Live API 进行语音对话

```typescript
// 获取配置
const { geminiConfig, sessionId } = await startVoiceChat('daily_chat', {
  goalType: 'sleep',
  currentTargetTime: '01:00',
});

// 连接 Gemini Live API
const ws = new WebSocket(
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${geminiConfig.apiKey}`
);

// 发送初始化配置
ws.onopen = () => {
  ws.send(JSON.stringify({
    setup: {
      model: `models/${geminiConfig.model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: geminiConfig.voiceConfig.voiceName,
            },
          },
        },
      },
      systemInstruction: {
        parts: [{ text: geminiConfig.systemPrompt }],
      },
    },
  }));
};

// 处理 AI 回复
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // 处理音频数据...
};

// 发送用户语音
const sendAudio = (audioData: ArrayBuffer) => {
  ws.send(JSON.stringify({
    realtimeInput: {
      mediaChunks: [{
        mimeType: 'audio/pcm',
        data: btoa(String.fromCharCode(...new Uint8Array(audioData))),
      }],
    },
  }));
};
```

## 本地测试

```bash
# 1. 启动 Edge Function
supabase functions serve start-voice-chat --env-file .env.local

# 2. 调用测试
curl -X POST https://127.0.0.1:54321/functions/v1/start-voice-chat \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "chatType": "intention_compile",
    "context": {
      "phase": "onboarding"
    },
    "aiTone": "gentle"
  }' \
  --insecure
```

## 环境变量

```
GEMINI_API_KEY=你的 Gemini API Key
```

## 流程图

```
用户点击"开始语音对话"
        ↓
调用 start-voice-chat API
        ↓
┌───────────────────────────────────────┐
│  1. 根据 chatType 生成 System Prompt  │
│  2. 创建 chat_sessions 记录           │
│  3. 返回 Gemini 配置                  │
└───────────────────────────────────────┘
        ↓
前端收到配置
        ↓
前端连接 Gemini Live API WebSocket
        ↓
用户说话 ↔ AI 语音回复
        ↓
用户结束对话
        ↓
前端保存对话记录（可选）
```
