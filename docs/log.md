心原理：Gemini Live API 内置转录功能                                                                                   
                                                                                                                           
  关键在于 Gemini Live API 自带语音转文字功能，不需要额外调用 Google Speech-to-Text 等独立服务。                           
                                                                                                                           
  开启方式

  在 src/hooks/gemini-live/core/useGeminiSession.ts 中，连接 Gemini 时配置了两个转录选项：

  inputAudioTranscription: {},   // 用户语音 → 文字
  outputAudioTranscription: {},  // AI语音 → 文字

  这两行告诉 Gemini：「请帮我把双方的语音都转成文字一起返回」。

  完整数据流

  用户说话 → 麦克风录制PCM音频 → 发送给Gemini WebSocket
                                        ↓
                                Gemini 同时做两件事：
                                1. 理解语音内容，生成AI语音回复
                                2. 把用户语音转成文字（inputTranscription）
                                3. 把AI语音也转成文字（outputTranscription）
                                        ↓
                                通过WebSocket返回前端
                                        ↓
                      useTranscriptProcessor 处理：
                      - 去重（避免重复片段）
                      - 缓冲拼接（把零碎片段拼成完整句子）
                      - 安全过滤（移除[SYSTEM]等标签）
                                        ↓
                      显示在 VoiceChatTest 的消息列表中

  关键文件
  ┌─────────────────────────────────────────────────┬────────────────────────────────────────────┐
  │                      文件                       │                    作用                    │
  ├─────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ src/hooks/gemini-live/core/useGeminiSession.ts  │ 开启转录功能，配置 WebSocket 连接          │
  ├─────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ src/hooks/ai-coach/useTranscriptProcessor.ts    │ 接收原始转录流，去重、缓冲、拼接成完整消息 │
  ├─────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ src/hooks/gemini-live/features/useTranscript.ts │ 管理转录消息状态                           │
  ├─────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ src/components/dev/VoiceChatTest.tsx            │ 页面上渲染消息列表                         │
  └─────────────────────────────────────────────────┴────────────────────────────────────────────┘
  消息显示逻辑

  在 VoiceChatTest.tsx 中，通过 onTranscriptUpdate 回调接收转录更新：

  geminiLive.onTranscriptUpdate = (newTranscript) => {
    // 合并连续同角色的消息
    // 过滤掉噪声标记
    // 更新UI显示
    setMessages(mergedMessages);
  }

  总结：不需要额外的 STT 服务，Gemini Live API 的 inputAudioTranscription 和 outputAudioTranscription
  配置已经帮你实现了双向字幕。转录结果通过 WebSocket 实时返回，经过 useTranscriptProcessor 处理后显示在界面上。