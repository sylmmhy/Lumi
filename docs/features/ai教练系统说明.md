---                                                        
  一、功能分类总览                                        
                                                             
  这个 Hook 承担了 7 大类职责，我按代码中的位置依次说明：    

  1. 状态管理 & Refs（第 107~193 行）                        
                                                             
  做什么：管理整个 AI 教练会话的所有状态和引用。
  状态: state (taskDescription, timeRemaining,
  isTimerRunning,
    messages)
  用途: 核心会话状态
  ────────────────────────────────────────
  状态: isConnecting / isSessionActive / connectionError
  用途: 连接生命周期
  ────────────────────────────────────────
  状态: isObserving
  用途: AI 观察阶段（开场前）
  ────────────────────────────────────────
  状态: isCampfireMode / campfireSessionId /
  campfireChatCount
  用途: 篝火模式状态
  Refs 一共 18 个，分三类：
  - 避免闭包问题：addMessageRef, cleanupRef,
  saveSessionMemoryRef, onCountdownCompleteRef,
  intentDetectionRef, orchestratorRef, enterCampfireModeRef,
  exitCampfireModeRef
  - 业务数据存储：currentUserIdRef,
  currentTaskDescriptionRef, currentTaskIdRef,
  currentCallRecordIdRef, preferredLanguagesRef,
  successRecordRef, savedSystemInstructionRef
  - 语音处理：userSpeechBufferRef, lastProcessedRoleRef,
  processedTranscriptRef, aiSpeechLogBufferRef,
  aiSpeechLogTimerRef
  - 篝火模式：campfireReconnectLockRef, campfireIdleTimerRef,
   campfireMicStreamRef

  ---
  2. 消息管理 & 语音转文字处理（第 198~293 行）

  做什么：处理 Gemini 实时返回的语音转录，拼成完整消息存入
  state。

  核心逻辑：
  - addMessage() — 往 messages 数组追加消息
  - onTranscriptUpdate 回调 — 这是最复杂的部分：
    - 用户语音：碎片化到来，先累积到
  userSpeechBufferRef，不立即存储
    - AI 语音：直接存储，同时触发话题检测和意图检测
    - 角色切换：当 AI 开始说话时，才把之前累积的用户消息一次
  性存储，并触发话题检测 + 记忆检索
    - 去重：用 processedTranscriptRef 防止同一条消息重复处理

  ---
  3. 倒计时系统（第 469~597 行）

  做什么：任务倒计时，到 0 时触发结束流程。

  - startCountdown() — 启动倒计时 + 记录开始时间
  - stopCountdown() — 停止倒计时
  - 倒计时 effect — 每秒 -1，到 0 时依次触发：保存记忆 →
  清理资源 → 回调外部

  ---
  4. 篝火模式（第 599~841 行，~240 行）

  做什么：用户专注工作时的"安静陪伴"模式。进入后 AI
  断开连接，播放白噪音，用户说话时才重连 AI。

  包含：
  - 子 Hook 组合：useAmbientAudio（白噪音）、useFocusTimer（
  计时）、useIntentDetection（意图检测）
  - enterCampfireMode() — 进入篝火模式（让 AI 说告别语 → 断
   → 开麦克风 → 播白噪音 → 创建后端 session）
  - exitCampfireMode() — 退出篝火模式（停止白噪音 → 停麦克风
  → 重连 AI → 更新数据库）
  - campfireReconnectGemini() — VAD 检测到用户说话时重连 AI
  - startCampfireIdleTimer() — 30 秒空闲后断开 AI
  - campfireVad — 独立的 VAD 实例，在 Gemini 断开时监听麦克
  - 多个 effect 处理：空闲超时、AI 说话时降低白噪音音量

  ---
  5. 虚拟消息系统（第 343~457 行）

  做什么："AI 主动找用户说话"的两套系统。

  两套并行系统：
  1. useVirtualMessageOrchestrator（方案 2：过渡话注入）—
  动态调度，基于对话上下文和记忆检索注入消息
  2. useVirtualMessages（原有定时系统）—
  基于时间节点触发（如开场白、中期 check-in、memory boost）

  还有：
  - fetchCoachGuidance() — 调用后端生成"智能小纸条"
  - getConversationContext() — 获取当前对话上下文
  - Turn complete 协调 — 当 AI 说完一轮话时，同时通知两套系

  ---
  6. 会话生命周期管理（第 843~1364 行）

  做什么：会话的完整生命周期：启动 → 运行 → 结束 → 重置。

  - startSession()（最长的函数，~250 行）— 并行执行：
    a. 摄像头初始化（带重试）
    b. 麦克风初始化 + 记录 callRecordId
    c. 后端获取 system instruction（含记忆检索）
    d. 获取 Gemini token
    e. 连接 Gemini Live
    f. 启动倒计时
  - cleanup() — 统一清理（记录通话结束 → 停倒计时 → 断开
  Gemini → 重置状态）
  - endSession() — 调用 cleanup
  - stopAudioImmediately() — 立即静音（用于挂断时快速响应）
  - resetSession() — 完全重置所有状态
  - 组件卸载清理 — 清理定时器、断开 Gemini、释放篝火资源

  ---
  7. 记忆保存（第 1143~1314 行）

  做什么：会话结束时，把对话内容提取为长期记忆存入后端。

  - saveSessionMemory() — 核心流程：
    a. 收集剩余的用户语音 buffer
    b. 过滤虚拟消息（只保存真实对话）
    c. 转换为 Mem0 格式
    d. 调用后端 memory-extractor 提取记忆
    e. 如果任务完成，更新 tasks 表的 actual_duration_minutes

  ---
  二、DEV 模式下的 console.log 汇总

  会话启动阶段
  日志: 🚀 开始 AI 教练会话...
  触发条件: DEV
  说明: 会话开始
  ────────────────────────────────────────
  日志: ⚠️ 检测到旧会话，先清理...
  触发条件: DEV + 旧连接存在
  说明: 清理旧会话
  ────────────────────────────────────────
  日志: 🚀 全并行启动...
  触发条件: 始终
  说明: 并行初始化开始
  ────────────────────────────────────────
  日志: 🎬 [并行] 摄像头初始化...
  触发条件: 始终
  说明: 摄像头初始化
  ────────────────────────────────────────
  日志: 📹 摄像头尝试 #N
  触发条件: 始终
  说明: 摄像头重试
  ────────────────────────────────────────
  日志: ✅ 摄像头启用成功 / ❌ 摄像头启用异常
  触发条件: 始终
  说明: 摄像头结果
  ────────────────────────────────────────
  日志: 🎤 [并行] 麦克风初始化...
  触发条件: 始终
  说明: 麦克风初始化
  ────────────────────────────────────────
  日志: 📞 记录 mic_connected_at
  触发条件: 始终 + 有 callRecordId
  说明: 通话记录
  ────────────────────────────────────────
  日志: 🧠 [记忆检索] 本次会话取到的记忆:
  触发条件: DEV
  说明: 显示检索到的记忆列表
  ────────────────────────────────────────
  日志: 📊 获取到用户成功记录:
  触发条件: DEV
  说明: 成功记录
  ────────────────────────────────────────
  日志: 🎤 使用 AI 声音:
  触发条件: DEV
  说明: AI 声音名称
  ────────────────────────────────────────
  日志: ✅ 连接已建立 / ✨ AI 教练会话已成功开始
  触发条件: DEV
  说明: 连接成功
  ────────────────────────────────────────
  日志: ❌ startSession 错误:
  触发条件: 始终
  说明: 连接失败
  运行期间
  日志: 🎤 用户说: ...
  触发条件: DEV
  说明: 用户完整语音（buffer 刷新后）
  ────────────────────────────────────────
  日志: 🤖 AI 说: ...
  触发条件: DEV
  说明: AI 完整语音（500ms 防抖后）
  ────────────────────────────────────────
  日志: 👀 AI 开始说话，观察阶段结束
  触发条件: DEV
  说明: 观察期结束
  ────────────────────────────────────────
  日志: 话题检测失败:
  触发条件: DEV (warn)
  说明: 话题检测异常
  篝火模式
  日志: 🏕️ Entering campfire mode...
  触发条件: 始终
  说明: 进入篝火
  ────────────────────────────────────────
  日志: 🔌 [Campfire] VAD triggered, reconnecting...
  触发条件: 始终
  说明: 用户说话重连
  ────────────────────────────────────────
  日志: 🕐 [Campfire] Idle timeout, disconnecting...
  触发条件: 始终
  说明: 空闲断开
  ────────────────────────────────────────
  日志: 🏕️ Exiting campfire mode...
  触发条件: 始终
  说明: 退出篝火
  会话结束 & 记忆保存
  日志: 🔌 结束 AI 教练会话...
  触发条件: DEV
  说明: 结束会话
  ────────────────────────────────────────
  日志: 🧹 执行统一清理... / ✅ 统一清理完成
  触发条件: DEV
  说明: 清理过程
  ────────────────────────────────────────
  日志: 📞 记录通话结束:
  触发条件: 始终 + 有 callRecordId
  说明: 通话时长记录
  ────────────────────────────────────────
  日志: 🧠 正在保存会话记忆...
  触发条件: DEV
  说明: 记忆保存开始
  ────────────────────────────────────────
  日志: 📤 [Mem0] 发送到 Mem0 的内容:
  触发条件: DEV
  说明: 完整 payload
  ────────────────────────────────────────
  日志: 💾 [记忆保存] 本次会话存的记忆:
  触发条件: DEV
  说明: 保存结果
  ────────────────────────────────────────
  日志: ✅ 任务完成时长已保存到数据库:
  触发条件: DEV
  说明: 任务时长更新
  问题：很多日志（尤其摄像头、麦克风、通话记录）没有用
  import.meta.env.DEV 包裹，会在生产环境输出。

  ---
  三、重构计划

  当前文件 1421 行，承担 7 大类职责，18 个
  Ref，大量因为闭包问题而引入的 Ref-同步
  effect。我建议拆成以下模块：

  拆分方案

  src/hooks/ai-coach/
  ├── index.ts                     # 对外导出
  useAICoachSession
  ├── useAICoachSession.ts         # 主编排层（~150
  行），组合下面的子 Hook
  ├── useSessionLifecycle.ts       # 会话启动/结束/清理（~200
   行）
  ├── useTranscriptProcessor.ts    # 语音转录处理 &
  消息管理（~120 行）
  ├── useSessionTimer.ts           # 倒计时逻辑（~80 行）
  ├── useSessionMemory.ts          # 记忆保存 &
  任务时长更新（~180 行）
  ├── useCampfireMode.ts           # 篝火模式全部逻辑（~250
  行）
  ├── types.ts                     # 接口定义 & 配置常量（~60
   行）
  └── utils.ts                     # withTimeout,
  isValidUserSpeech 等工具函数（~30 行）

  各模块职责
  模块: types.ts
  职责: AICoachMessage, AICoachSessionState,
    UseAICoachSessionOptions, 配置常量
  从哪里来: 第 16~97 行
  ────────────────────────────────────────
  模块: utils.ts
  职责: withTimeout, isValidUserSpeech
  从哪里来: 第 33~97 行
  ────────────────────────────────────────
  模块: useSessionTimer.ts
  职责: startCountdown, stopCountdown, 倒计时 effect，到 0
    时调用外部回调
  从哪里来: 第 469~597 行
  ────────────────────────────────────────
  模块: useTranscriptProcessor.ts
  职责: addMessage, 用户语音 buffer 累积、AI 语音 buffer
    防抖、去重、角色切换检测、通知
    orchestrator/intentDetection
  从哪里来: 第 198~293 行
  ────────────────────────────────────────
  模块: useSessionMemory.ts
  职责: saveSessionMemory，消息过滤、Mem0 格式转换、调后端
    memory-extractor、更新任务时长
  从哪里来: 第 1143~1314 行
  ────────────────────────────────────────
  模块: useCampfireMode.ts
  职责: 篝火模式的全部状态 +
    逻辑：进入/退出、白噪音、计时器、VAD
    重连、空闲断开、意图检测
  从哪里来: 第 599~841 行
  ────────────────────────────────────────
  模块: useSessionLifecycle.ts
  职责: startSession（硬件初始化 + 后端请求 + Gemini
    连接）、cleanup、endSession、resetSession、通话记录
  从哪里来: 第 843~1364 行
  ────────────────────────────────────────
  模块: useAICoachSession.ts
  职责: 主编排层：组合以上所有子
    Hook，桥接它们之间的数据流，返回统一 API
  从哪里来: 新的精简版
  关键设计原则

  1. 减少 Ref 数量：目前 18 个 Ref 中，至少一半是因为"函数需
  要被另一个闭包引用但会变化"。拆分后，每个子 Hook 管自己的
  Ref，主编排层只负责传参，Ref 数量天然减少。
  2. 子 Hook 之间通过参数和回调通信，不再通过共享 Ref。例如
  // useTranscriptProcessor 通过回调通知外部
  const transcript = useTranscriptProcessor({
    onUserMessage: (text) => {
  orchestrator.onUserSpeech(text); },
    onAIMessage: (text) => { orchestrator.onAISpeech(text);
  intentDetection.processAIResponse(text); },
  });
  3. 日志统一管理：把所有生产环境不该有的 console.log 包裹到
  DEV 判断中。可以在 utils.ts 里加一个 devLog() 工具函数。
  4. 保持对外 API 不变：useAICoachSession
  的返回值签名不变，调用方无需任何修改。

  你觉得这个拆分方案怎么样？有什么想调整的地方吗？