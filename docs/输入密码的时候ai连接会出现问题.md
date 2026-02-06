
新的bug是：
锁屏情况下接听，面容验证失败，手动输入密码，然后ai会连不上。但是如果是面容解锁的就不会有问题。这个问题稳定复现了很多次。

第一个ai的建议：整体方向“八九不离十”，但那段 AI 诊断里确实有几个关键纰漏，需要你注意别被带偏。

哪些结论是有证据支撑的

“不是网络连不上，而是启动流程卡住导致 15 秒后统一超时”这点能被代码和时间戳直接证明：startSession 用 withTimeout(Promise.all([...]), 15000ms, '获取配置超时…') 包住了“摄像头初始化 + 麦克风初始化 + 系统指令 + token”四个并行任务。见 useSessionLifecycle.ts (lines 246-346) 和 types.ts (line 12)。你 log 里 10:48:14.827 开始，10:48:29.804 报错，正好约 15 秒。
“麦克风那条线大概率卡住了”也基本对得上：并行任务 B 在 await o.geminiLive.toggleMicrophone() 后才会打出“toggleMicrophone() 完成”，但你的 web log 只有“调用 toggleMicrophone()...”没有完成日志（对应上面同一段代码 useSessionLifecycle.ts (lines 286-315)）。
AI 诊断里最容易误导人的点

它把“获取配置超时”当成“拉配置的网络请求超时”来解释，这是不严谨的。按你们代码，这个超时是“整个并行初始化没跑完”的统一超时，任何一个环节卡住都会报这个错（最常见就是麦克风/音频相关 Promise 一直 pending）。
它把“摄像头启用异常”当作“摄像头 getUserMedia 失败”的强证据，但从代码看，这个 InvalidStateError: Failed to start the audio device 更可能是 audioOutput.ensureReady() 里的 AudioContext.resume() 抛出来的，而不一定是摄像头本身：
toggleCamera() 先 await audioOutput.ensureReady() 再 await videoStart()，见 useGeminiLive.ts (lines 320-329)。
videoStart() 自己 try/catch 了 getUserMedia，catch 里不 throw（只 setError/onError），理论上不会把异常抛回 toggleCamera()，见 useVideoInput.ts (lines 74-122)。
ensureReady() 里确实会创建/resume() AudioContext，且没有 try/catch，见 useAudioOutput.ts (lines 54-88)。
所以“摄像头报错”这条更准确的表述应是“音频设备启动失败”，AI 在归因上有偏差。
“CallKit 绝对超时 8 秒触发 hangup、didDeactivate 时机错误”这一整段在你贴的 Xcode log 里没有直接证据（AI 自己也承认没看到 didActivate/didDeactivate/performHangup）。这部分属于推测，不能当结论。
它还漏掉的一个重要变量

你的 Xcode log 里出现了 SleepMusicManager 的多次音频路由变化（以及键盘相关 RTI log）。这意味着“除了 CallKit”，你们自己的音频模块也在切 AVAudioSession，可能参与竞争。AI 诊断把所有音频变化都归因给 CallKit，有点过度单因归因。
如果你要把诊断做实，最小补证据建议

在 web 侧把“卡在哪一步”打穿：分别给 audioOutput.ensureReady()、audioStart()（进到 AudioRecorder.start() 的 Requesting microphone access... 前后）加开始/结束日志和耗时，这样能区分是卡在 AudioContext.resume() 还是卡在 getUserMedia({audio:true})。关键代码位置：useGeminiLive.ts (lines 304-314)、audio-recorder.ts (lines 79-130)。
在 iOS 原生侧补齐 CallKit 生命周期日志（didActivate/didDeactivate 等）并确保 log 采集覆盖到“解锁前后”，否则“8 秒超时”这类结论永远只能猜。



第二个ai的建议：
这下有非常不同的 log 了。让我分析关键差异。                                                      
                                                                                                   
  ---                                                                                              
  新 Bug 分析：锁屏密码输入 → AI 连接失败                                                          
                                                                                                   
  关键证据对比                                                                                     
  事件: 摄像头初始化                                                                               
  Face ID 成功 (旧 log): 📹 Camera started ✅                                                      
  密码输入 (新 log): ❌ Failed to start the audio device
  ────────────────────────────────────────
  事件: 麦克风请求
  Face ID 成功 (旧 log): Requesting microphone access... → granted
  密码输入 (新 log): 完全没有出现（卡死了）
  ────────────────────────────────────────
  事件: Gemini 连接
  Face ID 成功 (旧 log): Gemini Live connected ✅
  密码输入 (新 log): 超时失败
  ────────────────────────────────────────
  事件: 最终结果
  Face ID 成功 (旧 log): AI 说话成功
  密码输入 (新 log): 获取配置超时，请检查网络连接后重试
  新 log 中的致命错误链

  [10:48:14.827] 📹 摄像头尝试 #1，调用 toggleCamera()...
  [10:48:14.827] ❌ 摄像头启用异常: InvalidStateError: Failed to start the audio device  ← 关键!
  [10:48:14.827] 🎤 调用 toggleMicrophone()...
                 (之后再也没有 "Requesting microphone access" 或 "Microphone started")  ← 卡死了!

  [10:48:17.992] 📹 摄像头尝试 #2...  (3秒后重试，仍然无结果)
  [10:48:17.992] ✅ Ephemeral token received  (token 倒是拿到了)

  [10:48:29.804] ❌ startSession 错误: 获取配置超时  ← 15秒后超时

  根本原因

  InvalidStateError: Failed to start the audio device — 这个错误说明 音频硬件被 CallKit/VoIP
  锁住了，WKWebView 的 getUserMedia() 无法获取到音频设备。

  为什么面容解锁没问题，密码输入有问题？ 关键在于时间差：

  面容解锁 (< 1秒):
    接听 → Face ID 验证 → 立即解锁 → App 前台 → CallKit 挂断 → 音频释放 → WebView 请求麦克风 ✅

  密码输入 (5-15秒):
    接听 → Face ID 失败 → 密码键盘 → 用户输入... → 解锁 → App 前台 → WebView 请求麦克风
                                      ↑                                         ↑
                                这段时间里 CallKit 的                    此时 CallKit 可能已经
                                绝对超时(8s)可能已触发                   在中间状态，音频设备被锁

  具体来说，密码输入期间发生了一系列音频会话冲突：

  1. 用户接听 VoIP → CallKit 激活音频会话（didActivate）
  2. Face ID 失败 → 系统切到密码键盘（可能改变音频路由）
  3. Xcode log 里的 AVAudioSessionRouteChangeReason(rawValue: 3) = CategoryChange，出现了 3 次 —
  证明音频会话类别在反复切换
  4. CallKit 的绝对超时(8秒)在密码输入期间触发 → performHangup() → endCall() → didDeactivate
  5. didDeactivate 时 app 可能还在后台/过渡中 → 音频重新配置在不正确的时机执行
  6. 用户终于输完密码，app 前台化，WebView 加载 → 尝试 getUserMedia() → 音频设备处于破碎的中间状态
  → InvalidStateError

  Xcode log 补充证据

  [SleepMusic] 音频路由变化: AVAudioSessionRouteChangeReason(rawValue: 3)  ← CategoryChange
  [SleepMusic] 音频路由变化: AVAudioSessionRouteChangeReason(rawValue: 3)  ← CategoryChange
  [SleepMusic] 音频路由变化: AVAudioSessionRouteChangeReason(rawValue: 3)  ← CategoryChange

  音频路由的 category 被切换了 3 次，说明系统在频繁改变音频会话状态。这正是 CallKit
  挂断过程中音频资源被来回争夺的表现。

  另一个重要发现

  Xcode log 中 完全没有 CallKit 诊断日志（没有 didActivate、handleWebViewReady、performHangup
  等），这有两种可能：
  1. CallKit 事件在 log 采集之前就已完成
  2. 或者 Xcode 的 log filter 没有捕获到

  总结
  项目: 问题
  说明: 密码输入期间 CallKit 音频会话超时挂断，didDeactivate 在 app
    未前台时触发，导致音频重新配置时机错误
  ────────────────────────────────────────
  项目: 证据
  说明: InvalidStateError: Failed to start the audio device + 麦克风 getUserMedia 卡死 + 3次
    CategoryChange
  ────────────────────────────────────────
  项目: 根因
  说明: CallKit 绝对超时(8s) < 密码输入时间(5-15s)，导致音频释放时 WebView 还没准备好接管
  ────────────────────────────────────────
  项目: 影响范围
  说明: 仅影响锁屏→密码输入场景，Face ID 成功因为足够快不受影响
  修复方向（仅供讨论，不改代码）

  1. iOS 端：在 callKitDidDeactivateAudio 通知处理中，如果 WebView
  尚未完成加载，延迟音频重新配置，或标记需要在 WebView 就绪后重新配置
  2. iOS 端：增加绝对超时时间（当前 8s 太短，密码输入可能需要 15s+）
  3. 前端：在 toggleCamera/toggleMicrophone 失败时，增加更长的重试间隔和更多次重试（当前只重试 2
  次，间隔 1s）
  4. 前端：监听 nativeAudioSessionReady 事件，在音频会话真正就绪后再启动 AI 会话，而不是并行启动

  你觉得哪个方向最合理？需要我深入研究某个方向吗？



-----

相互审查的回复：
                                                                                                 
⏺ 这个 AI 的审查质量非常高，有几处纠正了我的不严谨之处。让我逐点评价：
                                                                                                   
  ---                                                                                              
  对方审查的评价
                                                                                                   
  完全正确的纠正                                                                                 
                                                                                                   
  1. "获取配置超时" 不是网络超时                                                                   

  对方说得对。我在分析中没有足够精确。这个超时是 Promise.all([摄像头, 麦克风, 系统指令, token]) 的
  统一 15 秒超时，任何一个 Promise 卡住都会报这个错。我用"检查网络连接"这个错误消息文本误导了自己

  2. 摄像头报错的真正来源是 AudioContext.resume()，不是 getUserMedia()

  这个纠正很精准。我说"音频硬件被 CallKit 锁住"的方向是对的，但归因到 camera getUserMedia
  是错的。对方追溯了代码调用链：

  toggleCamera()
    → await audioOutput.ensureReady()    ← 这里抛出的 InvalidStateError
    → await videoStart()                 ← 这里有自己的 try/catch，不会抛出

  ensureReady() 做的是 AudioContext.resume()，这个没有 try/catch，所以错误冒泡到了
  toggleCamera()。真正失败的是 AudioContext，不是摄像头。

  3. CallKit 超时推测缺乏直接证据

  对方说得对。我虽然承认了"Xcode log 中没有 CallKit 日志"，但仍然把"8
  秒绝对超时在密码输入期间触发"当成结论来写了。这确实是推测，不应该当结论。

  对方补充的好观点

  4. SleepMusicManager 也在竞争音频会话

  这个我确实忽略了。我把 3 次 AVAudioSessionRouteChangeReason(rawValue: 3) 全归因给 CallKit，但 log
   明确标注这些是 [SleepMusic] 模块的。这说明除了 CallKit，app 自己的 SleepMusicManager 也在改变
  AVAudioSession 的 category，可能是音频状态被搞乱的另一个参与者。

  ---
  我的综合判断

  对方的审查纠正了我的 归因不精确 和 推测当结论 的问题，但 大方向没有分歧：

  核心问题是：密码输入的时间延迟导致 WebView 请求音频时，AudioContext.resume() 失败 +
  getUserMedia() 卡死。

  对方给出的 最小补证据建议 我完全同意，而且这是唯一正确的下一步：

  需要做的 2 件事

  1. Web 端加日志（定位到底卡在哪一步）

  目前只知道 toggleMicrophone() 被调用了但没完成，但不知道具体卡在：
  - audioOutput.ensureReady() (AudioContext.resume)？
  - navigator.mediaDevices.getUserMedia({audio: true})？
  - 还是 AudioRecorder.start() 内部的某个 await？

  需要在这几个关键点加 console.log + 时间戳。

  2. iOS 端补齐 CallKit 生命周期日志

  确保下次复现时 Xcode log 能采集到：
  - didActivate 是否被调用以及时间
  - performHangup() 是否被调用
  - didDeactivate 的时间
  - 以及这些事件和 密码输入完成 之间的时序关系

  ---
  你想先做哪个？我建议 先在 Web 端加诊断日志，因为前端改动更快、不需要重编
  iOS，下次复现就能定位到底是 AudioContext.resume() 还是 getUserMedia() 卡住的。

-----

## ✅ 已完成：Web 端诊断日志已添加

### 修改的文件和加的日志位置

#### 1. `src/hooks/gemini-live/media/useAudioOutput.ts` - `ensureReady()`
- AudioContext 创建开始/完成/失败 + 耗时
- AudioContext.resume() 开始/完成/失败 + 耗时
- 总耗时 + 最终状态

#### 2. `src/lib/audio-recorder.ts` - `AudioRecorder.start()`
- 步骤1: `ensureAudioSessionReady()` 耗时
- 步骤2: `getUserMedia({audio: true})` 耗时 ← **关键！卡在这里说明麦克风被 iOS 锁住**
- 步骤3: AudioContext 创建 + resume 耗时
- 步骤3b: AudioContext.resume() 耗时（如果 suspended）
- 步骤4: AudioWorklet 加载耗时
- 总耗时

#### 3. `src/hooks/gemini-live/useGeminiLive.ts` - `toggleMicrophone()` / `toggleCamera()`
- toggleMicrophone: ensureReady → audioStart 两步分别计时
- toggleCamera: ensureReady → videoStart 两步分别计时 + ensureReady 失败的 catch 日志

#### 4. `src/hooks/gemini-live/media/useVideoInput.ts` - `start()`
- 步骤1: `ensureAudioSessionReady()` 耗时
- 步骤2: `getUserMedia({video})` 耗时
- 总耗时 + 失败日志

### 下次复现时如何看日志

下次在「锁屏 → 密码输入 → AI 连不上」场景复现后，在 Safari/Chrome DevTools 控制台搜索以下关键词：

1. **`[toggleCamera]`** — 看 ensureReady 是否失败（之前的 `InvalidStateError` 就是从这里抛出的）
2. **`[ensureReady]`** — 看 AudioContext 创建/resume 是否卡住或报错
3. **`[toggleMicrophone]`** — 看麦克风开启流程卡在哪一步
4. **`[AudioRecorder.start]`** — 看 getUserMedia 是否卡住（如果「步骤2」之后没有日志，说明 getUserMedia 挂了）
5. **`[videoInput.start]`** — 看摄像头的 getUserMedia 是否卡住

### 预期结果

根据之前分析，密码解锁场景应该会看到：
- `[toggleCamera]` 的 ensureReady 失败：`❌ AudioContext.resume() 失败` 或 `❌ AudioContext 创建失败`
- `[toggleMicrophone]` 的 audioStart 卡住：`[AudioRecorder.start] 步骤2: getUserMedia({audio: true}) 开始...` 之后再无日志

这样就能**精确确认**是 AudioContext 还是 getUserMedia 的问题了。


-----

 现在两端 log 都看完了。关键发现：                                                                
                                                                                                   
  完整的时间线对比（iOS + Web）                                                                    
                                                                                                   
  iOS 端时间线                                                                                     
  ┌──────────┬──────────────────────────────────────────────────┐
  │   时间   │                     iOS 事件                     │                                  
  ├──────────┼──────────────────────────────────────────────────┤                  
  │ 20:35:02 │ VoIP Push 收到，开始铃声                         │
  ├──────────┼──────────────────────────────────────────────────┤
  │ 20:35:07 │ CallKit 接听（响铃 5 秒），启动 8 秒绝对超时     │
  ├──────────┼──────────────────────────────────────────────────┤
  │ 20:35:07 │ action.fulfill() 已调用，等待 didActivate        │
  ├──────────┼──────────────────────────────────────────────────┤
  │ 20:35:07 │ AVAudioSession 配置失败（Code=560557684）        │
  ├──────────┼──────────────────────────────────────────────────┤
  │ ...      │ （很长的间隔 — 用户在输入密码）                  │
  ├──────────┼──────────────────────────────────────────────────┤
  │ 很久后   │ didActivate 被系统调用，开始等待 WebView 就绪    │
  ├──────────┼──────────────────────────────────────────────────┤
  │ 0.54s 后 │ WebView + 登录态就绪，notifyWebAudioSessionReady │
  ├──────────┼──────────────────────────────────────────────────┤
  │ 1.02s 后 │ performHangup 挂断 CallKit                       │
  ├──────────┼──────────────────────────────────────────────────┤
  │          │ didDeactivate，Post-CallKit 重新配置音频 → 成功  │
  └──────────┴──────────────────────────────────────────────────┘
  Web 端时间线
  时间: 12:35:09.524
  Web 事件: startSession 开始，全并行启动
  ────────────────────────────────────────
  时间: 12:35:09.524
  Web 事件: 摄像头 #1: 创建 AudioContext（suspended）
  ────────────────────────────────────────
  时间: 12:35:09.524
  Web 事件: 摄像头 #1: AudioContext.resume() → ❌ 失败 InvalidStateError: Failed to start the audio

    device
  ────────────────────────────────────────
  时间: 12:35:09.524
  Web 事件: 麦克风: AudioContext.resume() 开始 → 永远没有返回
  ────────────────────────────────────────
  时间: 12:35:10.528
  Web 事件: 摄像头 #2 重试: AudioContext.resume() 开始 → 永远没有返回
  ────────────────────────────────────────
  时间: 12:35:24.521
  Web 事件: 15 秒超时！ 获取配置超时
  关键发现

  Web 端在 12:35:09 开始了 startSession，但 iOS 端的 notifyWebAudioSessionReady 可能是在 12:35:09
  之后才发送的（或者发了但 Web 端的 AudioContext 已经进入了破碎状态）。

  问题的时序是：
  1. 用户接听 → 密码输入期间，iOS 还没调用 didActivate
  2. 但 WebView 已经加载完成并开始了 startSession
  3. Web 端尝试 AudioContext.resume() 时，iOS 的音频会话还在 CallKit 控制下 → 失败/卡死
  4. 后来 iOS 端 didActivate → didDeactivate → 重新配置音频 → notifyWebAudioSessionReady
  5. 但此时 Web 端的 AudioContext.resume() Promise 已经卡死了，不会再检查音频状态

  根因确认

  Web 端的 startSession 启动太早了 — 在 iOS 还没完成 CallKit 音频生命周期（didActivate →
  performHangup → didDeactivate → 重新配置音频）之前，Web 端就开始创建 AudioContext 并尝试
  resume()。

  修复方向：Web 端应该等待 nativeAudioSessionReady 事件后再创建 AudioContext，而不是并行启动。当前
  ensureAudioSessionReady() 只用在了 useVideoInput.start() 和 AudioRecorder.start() 里，但
  useAudioOutput.ensureReady()（创建 AudioContext 并 resume 的地方）没有等待这个事件。

  而且 AudioContext.resume() 一旦卡死就永远不返回，需要加超时 + 销毁重建的兜底机制。




  --------

  │ 修复：密码解锁后 AI 连接失败（AudioContext.resume() 卡死）                                      │
│                                                                                                 │
│ Context                                                                                         │
│                                                                                                 │
│ 问题：锁屏状态接听来电，Face ID 失败后手动输入密码，AI 连不上（稳定复现）。Face ID 解锁则正常。 │
│                                                                                                 │
│ 根因：useAudioOutput.ts 的 ensureReady() 在创建/resume AudioContext 前没有等待 iOS              │
│ 音频会话就绪（ensureAudioSessionReady()）。密码输入期间 CallKit                                 │
│ 还占用音频设备，AudioContext.resume() 要么立即失败（InvalidStateError），要么 Promise           │
│ 永远不返回（卡死），导致 15 秒后统一超时。                                                      │
│                                                                                                 │
│ 证据：Web 端 log 显示 AudioContext.resume() 在 12:35:09.524 失败/卡死，而 iOS 端                │
│ notifyWebAudioSessionReady 在之后才发送。                                                       │
│                                                                                                 │
│ 修复方案（两层防护）                                                                            │
│                                                                                                 │
│ 第 1 层：在 ensureReady() 中等待音频会话就绪                                                    │
│                                                                                                 │
│ 文件：src/hooks/gemini-live/media/useAudioOutput.ts                                             │
│                                                                                                 │
│ - 在 ensureReady() 函数开头加入 await ensureAudioSessionReady()                                 │
│ - 导入 ensureAudioSessionReady from ../../../lib/native-audio-session                           │
│ - 这确保 AudioContext 只在 iOS 音频设备释放后才创建/resume                                      │
│                                                                                                 │
│ 第 2 层：为 AudioContext.resume() 加超时 + 销毁重建                                             │
│                                                                                                 │
│ 文件：src/hooks/gemini-live/media/useAudioOutput.ts                                             │
│                                                                                                 │
│ - 用 Promise.race 给 resume() 加 3 秒超时                                                       │
│ - 超时或失败后：关闭旧 AudioContext → 等待音频会话就绪 → 创建新 AudioContext → 重试 resume      │
│ - 这是防御性兜底，防止 resume() 因 WebKit bug 永远不返回                                        │
│                                                                                                 │
│ 清理诊断日志                                                                                    │
│                                                                                                 │
│ 修复完成后，将之前加的 console.log 诊断日志改回 devLog（仅开发模式输出），保留关键错误日志。    │
│                                                                                                 │
│ 涉及文件：                                                                                      │
│ - src/hooks/gemini-live/media/useAudioOutput.ts — 主要修改                                      │
│ - src/hooks/gemini-live/useGeminiLive.ts — 清理诊断日志                                         │
│ - src/hooks/gemini-live/media/useVideoInput.ts — 清理诊断日志                                   │
│ - src/lib/audio-recorder.ts — 清理诊断日志                                                      │
│                                                                                                 │
│ 验证                                                                                            │
│                                                                                                 │
│ 密码解锁场景下，log 应该变为：                                                                  │
│ 🔊 [ensureReady] 等待 iOS 音频会话就绪...                                                       │
│ 🎤 Received nativeAudioSessionReady event from iOS                                              │
│ 🔊 [ensureReady] AudioContext 创建完成, 状态: suspended                                         │
│ 🔊 [ensureReady] AudioContext.resume() 完成                                                     │
│ 而不是之前的 ❌ Failed to start the audio device 或永远卡死。  