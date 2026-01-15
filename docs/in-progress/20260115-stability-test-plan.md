---
title: "代码变更稳定性测试"
created: 2026-01-15
updated: 2026-01-16 10:00
stage: "🧪 测试"
due: 2026-01-17
issue: ""
---

# 代码变更稳定性测试计划

## 阶段进度
- [x] 阶段 1：构建验证（npm run build + lint）
- [x] 阶段 2：遗漏引用检查
- [ ] 阶段 3：TimePicker 组件测试
- [x] 阶段 4：~~reportUserState 工具调用测试~~ ⏭️ **已跳过（Function Calling 暂时关闭）**
- [ ] 阶段 5：完整流程测试

---

## 1. 背景与目标

针对 `53d6b88` 到 `d951cd0` 的变更进行稳定性测试（共 21 个 commit）。

### 重点验证项
1. ~~`reportUserState` Function Calling 机制~~ ⏭️ **已跳过（暂时关闭）**
2. TimePicker 滚轮修复（选中项错位和时间不刷新问题）
3. 死代码删除后的依赖完整性
4. **新增**：双重问候语修复（`openingSentRef`）
5. ~~语气切换时机优化（turnComplete 触发）~~ ⏭️ **已跳过（依赖 Function Calling）**

**测试环境**：
- 项目无自动化测试框架
- 测试方式：手动测试 + 日志监控 + 构建验证

---

## 2. 测试用例

### 2.1 ~~reportUserState 工具调用测试~~ ⏭️ **已跳过**

> **状态**：Function Calling 暂时关闭，此测试跳过
> **原因**：用户决定暂时不使用 Function Calling 功能
> **相关文档**：`docs/in-progress/20260116-tone-manager-function-calling.md`

<details>
<summary>📁 归档：已发现的问题和测试用例（点击展开）</summary>

#### 已发现并修复的问题

1. **toolCall 消息位置错误**（✅ 已修复 `6783be2`）
   - 问题：原以为 `toolCall` 在 `serverContent` 中，实际是顶级消息字段
   - 修复：`messageHandlers.ts` 新增 `handleToolCall` 函数单独处理

2. **工具调用影响 turnComplete**（🔄 调试中）
   - 现象：启用工具后 `turnComplete` 信号可能异常
   - 曾临时禁用，现已恢复

#### 测试用例（已跳过）

| 用例 | 操作步骤 | 预期结果 |
|------|---------|---------|
| ~~**T1-1**~~ | ~~对 AI 说"太累了，不想做"~~ | ⏭️ 已跳过 |
| ~~**T1-2**~~ | ~~对 AI 说"好的，我去做"~~ | ⏭️ 已跳过 |
| ~~**T1-3**~~ | ~~连续 2 次抗拒~~ | ⏭️ 已跳过 |

#### 语气切换时机优化（已跳过）

**变更**：语气切换不再使用固定 500ms 延迟，改为等 `turnComplete` 时发送
- 使用 `pendingToneTriggerRef` 存储待发送的触发词
- 在 AI 说完话后才发送，避免打断

```typescript
// useAICoachSession.ts 新逻辑
if (pendingToneTriggerRef.current) {
  const triggerString = pendingToneTriggerRef.current;
  pendingToneTriggerRef.current = null;
  setTimeout(() => sendToneTriggerRef.current(triggerString), 300);
}
```

</details>

---

### 2.2 TimePicker 组件测试（高优先级）

#### HomeView - 新建任务（Modal 模式）

| 用例 | 操作步骤 | 预期结果 |
|------|---------|---------|
| **T2-1** 初始化位置 | 点击 "Set a time" 按钮 | 滚轮默认显示当前时间 +1 分钟，高亮正确 |
| **T2-2** 滚动选择 | 滑动小时滚轮到 18:00 | 18 高亮显示，滚动平滑 |
| **T2-3** 惯性滚动 | 快速滑动然后松手 | 自动滚动并吸附到最近整点 |
| **T2-4** 循环边界 | 从 23 点继续向下滚动 | 无缝过渡到 00 点 |
| **T2-5** 点击选择 | 直接点击 "15" 分钟 | 立即高亮 15，滚动到对应位置 |
| **T2-6** 确认值同步 | 选择时间后点击 OK | 任务以选定时间创建 |

#### HomeView - 编辑任务（Embedded 模式）

| 用例 | 操作步骤 | 预期结果 |
|------|---------|---------|
| **T2-7** 编辑初始化 | 点击已有任务的编辑按钮 | 滚轮显示任务原有时间，高亮正确 |
| **T2-8** 修改并保存 | 修改时间后点击保存 | 任务时间更新成功 |

#### StatsView - 编辑习惯

| 用例 | 操作步骤 | 预期结果 |
|------|---------|---------|
| **T2-9** 习惯时间编辑 | Stats 页点击习惯 → 编辑 | 滚轮显示习惯原有时间 |
| **T2-10** 保存习惯时间 | 修改时间后保存 | 习惯提醒时间更新 |

#### Onboarding - TimeSelectStep

| 用例 | 操作步骤 | 预期结果 |
|------|---------|---------|
| **T2-11** 新手引导时间选择 | 完成前几步后进入时间选择 | 滚轮正常显示，可以选择 |

---

### 2.3 死代码删除影响测试（中优先级）

#### 构建验证

```bash
npm run build        # TypeScript 编译 + Vite 构建
npm run lint         # ESLint 检查
```

#### 运行时验证

| 用例 | 操作步骤 | 预期结果 |
|------|---------|---------|
| **T3-1** 应用启动 | `npm run dev` 后访问 `/app/home` | 无 console 错误 |
| **T3-2** 路由导航 | 依次访问所有 Tab | 所有页面正常渲染 |
| **T3-3** AI 会话完整流程 | 开始 → 工作 → 完成 | 全程无报错 |

---

## 3. 实现记录

### 2026-01-16（更新 2）

#### Function Calling 已恢复
- **状态**：已重新启用 `tools: enableToneManager ? userStateTools : undefined`
- **问题**：仍有未知问题待确认
- **待提交**：本地修改尚未 commit

---

### 2026-01-16（更新 1）

#### 新增 13 个 commit（f11dc99 → d951cd0）

| Commit | 类型 | 说明 |
|--------|------|------|
| `d951cd0` | debug | 暂时禁用 Function Calling（已本地恢复） |
| `51b25e7` | revert | 回滚双重问候语修复 |
| `b85a24b` | fix | 修复双重问候语问题（successRecord 引用变化） |
| `8bc6d8b` | fix | 优化语气切换时机和防止重复问候语 |
| `6783be2` | fix | **修复 toolCall 是顶级消息字段** |
| `45b25e2` | debug | 暂时禁用工具注册测试 turnComplete |
| `e8cc8a8` | fix | TimePicker 滚轮错位修复（另一次） |

#### 关键发现

1. **Function Calling 与 turnComplete 冲突**
   - 启用工具后 AI 可能不正常触发 turnComplete
   - 曾暂时禁用，现已恢复，仍需观察

2. **双重问候语问题**
   - 原因：`successRecord` 对象引用变化导致 useEffect 重新执行
   - 修复：添加 `openingSentRef` 防止重复发送开场白

3. **toolCall 消息解析位置**
   - Gemini Live API 中 `toolCall` 是顶级字段，不在 `serverContent` 中
   - 已在 `messageHandlers.ts` 和 `useGeminiLive.ts` 中修复

---

### 2026-01-15
- [x] Phase 1 构建验证完成
  - `npm run build` 成功（3.49s）
  - `npm run lint` 有 17 errors, 9 warnings（非阻塞性）
- [x] 遗漏引用检查完成
  - 已删除模块无残留引用

**Lint 发现的问题**：
- TimePicker.tsx: `set-state-in-effect` 警告（有意为之，同步外部 props）
- 多个文件: `exhaustive-deps` 警告
- 多个文件: `no-unused-vars` 错误

---

## 4. 关键文件

| 文件 | 作用 | 变更状态 |
|------|-----|---------|
| `src/hooks/useAICoachSession.ts` | handleToolCall + pendingToneTrigger | 已修改 |
| `src/hooks/gemini-live/useGeminiLive.ts` | 顶级 toolCall 处理 | 已修改 |
| `src/hooks/gemini-live/core/messageHandlers.ts` | 新增 handleToolCall 函数 | 已修改 |
| `src/hooks/gemini-live/tools/userStateTools.ts` | reportUserState 工具定义 | 新增 |
| `src/hooks/useVirtualMessages.ts` | openingSentRef 防重复 | 已修改 |
| `src/components/app-tabs/TimePicker.tsx` | 滚轮选择器组件 | 已修改 |

---

## 5. 待办事项

- [ ] 执行 TimePicker 手动测试（T2-1 ~ T2-11）
- [x] ~~执行 reportUserState 工具调用测试（T1-1 ~ T1-3）~~ ⏭️ 已跳过
- [ ] 执行完整流程测试（T3-1 ~ T3-3）
- [ ] 测试双重问候语是否已修复
- [ ] 记录测试结果
- [x] ~~确认 Function Calling 的剩余问题~~ ⏭️ 已跳过（功能暂时关闭）

---

## 6. 相关 commit

- `53d6b88` - 变更起点
- `d951cd0` - 当前最新（暂时禁用 function calling）
- 共 **21 个提交**，涉及 **54 个文件**，净减少约 **5600 行代码**

### 关键 commit 链
```
53d6b88 (起点)
  ↓
cb827af fix(TimePicker): 修复滚轮选中项错位
105bc50 refactor: 清理死代码和未使用的依赖
  ↓
6783be2 fix: 修复 toolCall 是顶级消息字段
8bc6d8b fix: 优化语气切换时机和防止重复问候语
  ↓
d951cd0 debug: 暂时禁用 function calling (当前)
```

---

## 7. 通过标准

| 类别 | 通过条件 | 当前状态 |
|------|---------|---------|
| 构建 | `npm run build` 通过 | ✅ 已通过 |
| TimePicker | 所有 T2-x 用例通过，无视觉闪烁或错位 | ⏳ 待测试 |
| ~~reportUserState~~ | ~~每次回复前都能看到工具调用日志~~ | ⏭️ 已跳过 |
| 完整流程 | 能完成一次完整的任务而无 console 错误 | ⏳ 待测试 |
| 双重问候语 | 开始任务时只有一次问候语 | ⏳ 待测试 |

---

## 8. 风险评估

### 🟡 中风险
- **双重问候语**：已有修复但又回滚，需确认最终状态

### 🟢 低风险
- **死代码删除**：已验证无遗漏引用
- **TimePicker 修复**：局部改动，影响范围可控

### ⏭️ 已跳过（Function Calling 暂时关闭）
- ~~Function Calling 剩余问题~~
- ~~语气切换时机变更~~
- ~~toolCall 消息位置~~
