# 记忆保存竞态条件修复

---
date: 2026-01-20
stage: ✅ 完成
tags: [bugfix, memory-system, race-condition]
---

## 问题描述

用户反馈记忆系统没有保存任何数据。经排查发现：

1. 前端日志显示 `📤 [Mem0] 发送到 Mem0 的内容`，但没有显示成功或失败的后续日志
2. Supabase Edge Function 日志中**没有 `memory-extractor` 的调用记录**
3. 数据库 `user_memories` 表中该用户没有任何记忆

## 根因分析

在 `AppTabsPage.tsx` 中，`handleEndCall` 和 `handleEndAICoachSession` 函数存在竞态条件：

```javascript
// 问题代码
void aiCoach.saveSessionMemory({ forceTaskCompleted: false });  // 异步开始但不等待
aiCoach.endSession();  // 立即执行，触发 cleanup
```

**问题**：
- `saveSessionMemory` 是 async 函数，内部会调用 `supabaseClient.functions.invoke('memory-extractor', ...)`
- `void` 关键字丢弃了 Promise，不等待完成
- `endSession()` 立即被调用，触发 `cleanup()` 函数
- `cleanup()` 可能导致组件卸载或状态重置，中断正在进行的网络请求

**结果**：请求根本没有发送到服务器，或发送后被中断。

## 修复方案

将 `void` 改为 `await`，确保记忆保存完成后再执行清理：

```javascript
// 修复后
await aiCoach.saveSessionMemory({ forceTaskCompleted: false });
aiCoach.endSession();
```

## 修改文件

| 文件 | 行号 | 修改内容 |
|------|------|---------|
| `src/pages/AppTabsPage.tsx` | 890-900 | `handleEndCall` 改为 async，await saveSessionMemory |
| `src/pages/AppTabsPage.tsx` | 909-930 | `handleEndAICoachSession` 改为 async，await saveSessionMemory |

## 验证方法

1. 开始一个 AI 教练会话
2. 进行一些对话（表达拖延、情绪等）
3. 点击 "END CALL" 或 "I'M DOING IT!" 结束会话
4. 检查控制台日志，应该看到：
   - `📤 [Mem0] 发送到 Mem0 的内容: {...}`
   - `📊 任务完成状态: {...}`
   - `✅ 会话记忆已保存: {...}` ← 这行之前缺失
5. 检查 Supabase Dashboard → Edge Function Logs，应该有 `memory-extractor` 的 200 响应
6. 检查数据库 `user_memories` 表，应该有新记录

## 潜在影响

- **用户体验**：结束会话时会有短暂延迟（等待 API 响应），通常 1-3 秒
- **如果 API 失败**：`saveSessionMemory` 内部有 try-catch，失败会返回 `false` 但不会阻塞流程

## 回滚方案

如果修复导致问题，可以恢复原来的 `void` 写法，但需要另找方案解决记忆保存问题（如使用 `navigator.sendBeacon` 或 `keepalive` fetch）。

## 相关文件

- `src/hooks/useAICoachSession.ts:697-848` - `saveSessionMemory` 实现
- `supabase/functions/memory-extractor/index.ts` - 后端记忆提取逻辑
- `docs/architecture/memory-system.md` - 记忆系统架构文档
