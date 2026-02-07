Spike 测试：Session Resumption 验证                                                                                  │
│                                                                                                                      │
│ Context                                                                                                              │
│                                                                                                                      │
│ 我们在架构文档（统一裁判架构）中提出了用 session resumption 替代断开重连来切换 AI                                    │
│ 模式（如日常→习惯设定）。调研发现：                                                                                  │
│ - JS SDK @google/genai v1.34.0 已包含 SessionResumptionConfig 类型                                                   │
│ - 但社区有多个 bug 报告（handle 返回 None、ephemeral token 需特殊配置）                                              │
│ - 核心未知数：resume 时传新的 systemInstruction 是否真的改变 AI 行为                                                 │
│                                                                                                                      │
│ 本 spike 的目标是用最小改动验证这 3 个问题：                                                                         │
│ 1. 能否收到 resumption handle？                                                                                      │
│ 2. resume 后 AI 是否记得之前的对话？                                                                                 │
│ 3. resume 时换 systemInstruction，AI 行为是否改变？                                                                  │
│                                                                                                                      │
│ 需要改的文件                                                                                                         │
│                                                                                                                      │
│ 1. 后端：gemini-token 加 session resumption 约束                                                                     │
│                                                                                                                      │
│ 文件: /Users/miko_mac_mini/projects/Lumi-hackathon/Lumi-backend/supabase/functions/gemini-token/index.ts             │
│                                                                                                                      │
│ 在 authTokens.create() 的 config 中加入 liveConnectConstraints：                                                     │
│ liveConnectConstraints: {                                                                                            │
│   model: 'gemini-2.5-flash-native-audio-preview-12-2025',                                                            │
│   config: {                                                                                                          │
│     sessionResumption: {},                                                                                           │
│     responseModalities: ['AUDIO']                                                                                    │
│   }                                                                                                                  │
│ }                                                                                                                    │
│ 不加这个，服务器会静默忽略 resumption 请求（社区确认的 bug）。                                                       │
│                                                                                                                      │
│ 2. 前端：创建 spike 测试组件                                                                                         │
│                                                                                                                      │
│ 新文件: /Users/miko_mac_mini/projects/Lumi-hackathon/Lumi-front-end/src/components/dev/SessionResumptionSpike.tsx    │
│                                                                                                                      │
│ 纯文本交互的 spike 页面（不用音频，简化测试）：                                                                      │
│ - 直接使用 @google/genai SDK，不走 useGeminiSession（避免改动生产代码）                                              │
│ - responseModalities: ['TEXT']（文本模式，不需要麦克风）                                                             │
│ - 四个按钮 + 一个日志区域                                                                                            │
│                                                                                                                      │
│ 交互流程：                                                                                                           │
│ [连接（Prompt A）]  →  连接 Gemini，systemInstruction = "你是一只猫，只会说喵"                                       │
│                        启用 sessionResumption，监听 handle                                                           │
│ [发送消息]          →  发送 "你好"，AI 应回复"喵~"                                                                   │
│                        同时观察日志中是否出现 resumption handle                                                      │
│ [断开]              →  session.close()                                                                               │
│ [Resume（Prompt B）] →  用保存的 handle 重连，systemInstruction 换成 "你是一只狗，只会说汪"                          │
│                        自动发送 "我刚才说了什么？"                                                                   │
│                        观察：(1) AI 是否记得上下文 (2) AI 是否变成"狗"                                               │
│                                                                                                                      │
│ 日志区域实时显示：                                                                                                   │
│ - 连接状态                                                                                                           │
│ - 收到的 sessionResumptionUpdate（handle、resumable）                                                                │
│ - AI 回复的文本                                                                                                      │
│ - 错误信息                                                                                                           │
│                                                                                                                      │
│ 3. 前端：在 DevTestPage 注册测试入口                                                                                 │
│                                                                                                                      │
│ 文件: /Users/miko_mac_mini/projects/Lumi-hackathon/Lumi-front-end/src/pages/DevTestPage.tsx                          │
│                                                                                                                      │
│ - 在 TestMode union 加 'session-resumption-spike'                                                                    │
│ - 在菜单加一个按钮                                                                                                   │
│ - 在渲染区加 {mode === 'session-resumption-spike' && <SessionResumptionSpike onBack={backToMenu} />}                 │
│                                                                                                                      │
│ 不改的文件                                                                                                           │
│                                                                                                                      │
│ - useGeminiSession.ts — 不动生产代码，spike 直接用 SDK                                                               │
│ - messageHandlers.ts — 不动                                                                                          │
│ - types.ts — 不动                                                                                                    │
│                                                                                                                      │
│ 验证方式                                                                                                             │
│                                                                                                                      │
│ 1. 启动后端 npm run supabase:functions（在 Lumi-backend 目录）                                                       │
│ 2. 启动前端 npm run dev（在 Lumi-front-end 目录）                                                                    │
│ 3. 打开 /dev → 点击 "Session Resumption Spike"                                                                       │
│ 4. 按顺序点击：连接 → 发送 → 断开 → Resume                                                                           │
│ 5. 在日志中观察 3 个验证项的结果                     