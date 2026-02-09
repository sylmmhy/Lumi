完美！所有修改都已完成。让我总结一下这次的更新：

  ✅ 修改完成

  修改内容

  我已经根据你的需求，为不同的对话模式添加了智能判断：

  修改后的逻辑：

  1. 执行具体任务时（chatMode === 'coach'）
    - 点击"结束对话"按钮 → 弹出确认弹窗
    - 用户必须选择是否完成任务
  2. 和 Lumi 聊天时（chatMode === 'daily'）
    - 点击"结束对话"按钮 → 直接结束对话，不弹窗
  3. 设定习惯时（chatMode === 'setup'）
    - 点击"结束对话"按钮 → 直接结束对话，不弹窗

  具体修改的代码

  修改 src/hooks/useCoachController.ts：

  1. 添加 currentChatMode 状态追踪
  const [currentChatMode, setCurrentChatMode] = useState<'coach' | 'daily' | 'setup' | null>(null);
  2. 在启动 AI 会话时保存 chatMode
  setCurrentChatMode(taskToUse.chatMode || null);
  3. 修改 handleEndCall 逻辑
  if (currentChatMode === 'coach') {
      setShowTaskCompletionModal(true);  // 显示弹窗
  } else {
      // 直接结束对话
  }
  4. 修改 handleLiveKitSecondaryClick（LiveKit 模式）
    - 同样根据 chatMode 判断是否显示弹窗
  5. 更新弹窗确认逻辑
    - handleConfirmTaskCompleteFromModal - 同时支持 LiveKit 和 Gemini Live 模式
    - handleConfirmTaskIncompleteFromModal - 同时支持两种模式
  6. 在所有清理状态的地方添加 setCurrentChatMode(null)

  用户体验流程

  UrgencyView 页面
  ├── "陪我开始" (输入具体任务)
  │   └── chatMode: 'coach'
  │       └── 点击"结束对话" → 弹窗询问是否完成
  │
  ├── "和 Lumi 聊天"
  │   └── chatMode: 'daily'
  │       └── 点击"结束对话" → 直接结束，无弹窗
  │
  └── "设定习惯"
      └── chatMode: 'setup'
          └── 点击"结束对话" → 直接结束，无弹窗

  验证方式

  你可以运行 npm run dev 启动开发服务器，然后测试三种场景：

  1. 测试具体任务：
    - 在 UrgencyView 输入任务，点击"陪我开始"
    - 进入对话后点击"结束对话"
    - 应该弹出确认弹窗
  2. 测试聊天模式：
    - 点击"Talk to Lumi"按钮
    - 进入对话后点击"结束对话"
    - 应该直接结束，不弹窗
  3. 测试设定习惯：
    - 点击"设定习惯"按钮
    - 进入对话后点击"结束对话"
    - 应该直接结束，不弹窗

  所有修改都保持了原有的业务逻辑，只是根据对话模式智能判断是否需要确认任务完成。

✻ Baked for 5m 17s

❯ 在合并后，似乎前端的默认ui又改回去了如图。你改一下，原本在"I am doing                                                    
  it"按钮后面接的视觉验证的内容，加到询问是否做完的弹窗中，如果用户点击了做完，那么再加入视觉验证                          
  ⎿  [Image #3]                                                                                                            
                                                                                                                           
⏺ 我看到 UI 又恢复成两个按钮了。这可能是因为代码合并导致的冲突。让我检查一下当前的代码状态，然后修复它：                   
                                                                                                                         
⏺ Read 1 file (ctrl+o to expand)                                                                                           
                                                                                                                           
⏺ 我看到问题了！代码在合并时又恢复成了两个按钮，并且增加了视觉验证功能。现在我需要：                                       
                                                                                                                           
  1. 改回只有一个"结束对话"按钮                                                                                            
  2. 点击后弹出任务完成确认弹窗                                                    
  3. 如果用户选择"是，我完成了"，则进入视觉验证流程                                                                        
   
  让我先查看一下 handleRequestSessionCompletion 的实现：                                                                   
                                                                                   
⏺ Searched for 1 pattern (ctrl+o to expand)  
                                                                                                                         
⏺ Update(src/components/overlays/SessionOverlay.tsx)
  ⎿  Added 1 line, removed 6 lines                                                                                       
      291                              isObserving: coach.aiCoach.isObserving,                                             
      292                          }}                                                                                    
      293                          primaryButton={{                                                                        
      294 -                            label: "I'M DOING IT!",                                                           
      295 -                            emoji: '✅',                                                                        
      296 -                            onClick: coach.handleRequestSessionCompletion,                                      
      297 -                        }}                                                                                      
      298 -                        secondaryButton={{                                                                      
      299 -                            label: 'END CALL',                                                           
      294 +                            label: '结束对话',                                                                  
      295                              emoji: '🛑',
      296                              onClick: coach.handleEndCall,