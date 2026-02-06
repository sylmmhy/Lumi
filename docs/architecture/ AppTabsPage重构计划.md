AppTabsPage.tsx (line 1852) 本身只是 export default；你真正想重构的是整份 AppTabsPage.tsx（当前约 1852 行），它同时承担了「任务数据」「AI 会话（Gemini/LiveKit）」「Screen Time 桥接」「Auth gate」「URL autostart」「庆祝/记忆保存」「主壳渲染」等职责。

重构目标（不改行为，先拆职责）

把 AppTabsPage 变成“组装器”：只做路由 view 选择 + 渲染壳 + 挂载各类 overlay/modal。
把副作用和业务流程下沉到少量 page-level hooks/模块，让每块逻辑可单独理解、单独改、回归风险更小。
分步重构计划（建议按 commit/PR 一步一步做）

先加“验收清单”（写在 PR 描述或 TODO 里即可，不一定进代码）
登录/未登录时：新增任务（addTask）、开始任务（handleQuickStart）会正确走挂起/弹登录（见 AppTabsPage.tsx (line 471)、AppTabsPage.tsx (line 1020)）。
loadTasks 合并 routine_instance 状态、snooze/skip 标签显示不变（AppTabsPage.tsx (line 233)）。
Screen Time：start_task 事件触发后，完成任务会解锁；WebView reload 后 localStorage intent 能续跑（AppTabsPage.tsx (line 863)、AppTabsPage.tsx (line 956)）。
URL autostart：带 taskId 不重复创建；native app 缺 taskId 会拦截（AppTabsPage.tsx (line 1110)）。
LiveKit 模式连接/倒计时/结束逻辑不变（AppTabsPage.tsx (line 393)、AppTabsPage.tsx (line 423)）。
“END CALL”和“I’M DOING IT!” 两条路径的“后台保存记忆 + 标记完成 + 庆祝页”行为不变（AppTabsPage.tsx (line 1332)、AppTabsPage.tsx (line 1430)）。
提取纯工具与常量（低风险、立刻减噪）
getLocalDateString：reminderService 里已经在用同名函数做默认参数（见 reminderService.ts (line 263)），AppTabsPage 又实现了一份（AppTabsPage.tsx (line 67)）。建议集中到 date.ts，两边统一引用。
devLog：项目里至少两处重复（AppTabsPage.tsx (line 54)、PermissionsSection.tsx (line 7)），可提到 devLog.ts。
抽“任务域”hook：useAppTasks（把最稳定、边界最清晰的先搬走）
新建 useAppTasks.ts（或放 /Users/.../src/hooks/，但建议 page 专用放 pages 下，局部性更好）。
搬迁并封装：tasks/tasksLoaded/statsRefreshTrigger、loadTasks（AppTabsPage.tsx (line 233)）、handleRefresh（ (line 343)）、addTask（ (line 471)）、toggleComplete（ (line 570)）、handleStatsToggle（ (line 657)）、handleDeleteTask（ (line 666)）、handleUpdateTask（ (line 686)），以及“native 同步”和 registerNativeRefreshTasks 相关 effect（ (line 333)、 (line 315)）。
AppTabsPage 只拿到 { tasks, tasksLoaded, statsRefreshTrigger, addTask, toggleComplete, updateTask, deleteTask, refresh, patchTask(...) } 这种 API；AI 会话里需要把 called=true、替换临时任务为真实 UUID（现在在 startAICoachForTask 里做）也改用 useAppTasks 暴露的 patchTask/upsertTask 来做，避免外部直接 setTasks(...)。
抽“会话域”hook：useCoachController（把 Gemini/LiveKit/庆祝收拢）
新建 useCoachController.ts，容纳：
useAICoachSession 初始化与登出清理（AppTabsPage.tsx (line 358)、 (line 371)）。
LiveKit 状态与倒计时 effect（ (line 393)、 (line 423)）。
startAICoachForTask（ (line 719)）以及 Stats 里的 handleStatsStartTask（ (line 1049)）。
currentTaskId/currentTaskType/currentTaskDescription/currentCallRecordId/hasAutoStarted 等与会话强相关的状态。
“完成/结束”动作：handleEndCall（ (line 1332)）、handleEndAICoachSession（ (line 1430)）、倒计时结束回调（ (line 360)）。
关键：把“记忆保存”重复逻辑抽成一个模块函数（例如 saveSessionMemories.ts），handleEndCall 和 handleEndAICoachSession 只传入参数（task_completed、usedTime、actualDurationMinutes、messagesSnapshot、taskDescriptionSnapshot），避免两份代码未来漂移。
抽“Screen Time 域”hook：useScreenTimeController（桥接逻辑独立出来）
新建 useScreenTimeController.ts，容纳：
unlockScreenTimeIfLocked（AppTabsPage.tsx (line 130)）与相关 refs。
handleScreenTimeAction（ (line 863)）、useScreenTime(...)（ (line 945)）、localStorage intent 续跑 effect（ (line 956)）。
pledge confirm UI 状态（ (line 170)）与渲染所需 handlers。
hook 对外只暴露：unlockIfNeeded(source)、pledgeConfirmProps、以及一个 bindOnStartTask(task) 给会话 controller 调用（这样 ScreenTime 启动任务和普通 Start 走同一条 gate）。
抽 UI overlay 组件（让 return (...) 变短、条件更清楚）
新建 SessionOverlay.tsx：负责渲染 TaskWorkingView（Gemini/LiveKit 两套）与按钮回调绑定（对应现在 AppTabsPage 的 usingLiveKit 和 aiCoach.isSessionActive 两段渲染，见 AppTabsPage.tsx (line 1595)、 (line 1647)）。
新建 CelebrationOverlay.tsx：包 CelebrationView（AppTabsPage.tsx (line 1682)）。
AppTabsPage 最终只剩：主壳（Home/Stats/Urgency/Profile/Leaderboard）、底部导航、AuthModal/TestVersionModal、TourOverlay、ConsequencePledgeConfirm 的“挂载位”。
清理明显“死代码/不一致点”（最后做，避免你现在其实还想保留某功能）
VoicePermissionModal 相关状态在当前文件里没有任何地方把 showVoicePrompt 置为 true，pendingVoiceTask 也没有赋值路径（见 AppTabsPage.tsx (line 166)、 (line 167)、 (line 1251)）。这里需要你确认二选一：
这个提示已废弃：删掉 modal 与相关 state/handler；把 hasSeenVoicePrompt 仅作为 autostart 的 skipPrompt 标记即可。
这个提示要恢复：把 ensureVoicePromptThenStart 改成“未看过则 setShowVoicePrompt(true)+setPendingVoiceTask(task)，确认后再 start”，并补齐所有入口一致行为。