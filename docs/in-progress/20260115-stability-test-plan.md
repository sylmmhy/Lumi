---
title: "代码变更稳定性测试"
created: 2026-01-15
updated: 2026-01-15 14:30
stage: "🧪 测试"
due: 2026-01-16
issue: ""
---

# 代码变更稳定性测试计划

## 阶段进度
- [x] 阶段 1：构建验证（npm run build + lint）
- [x] 阶段 2：遗漏引用检查
- [ ] 阶段 3：TimePicker 组件测试
- [ ] 阶段 4：reportUserState 工具调用测试
- [ ] 阶段 5：完整流程测试

---

## 1. 背景与目标

针对 `53d6b88` 到 `f11dc99` 的变更进行稳定性测试，重点验证：
1. `reportUserState` Function Calling 机制（替代原有的 [RESIST] 文本标记）
2. TimePicker 滚轮修复（选中项错位和时间不刷新问题）
3. 死代码删除后的依赖完整性

**测试环境**：
- 项目无自动化测试框架
- 测试方式：手动测试 + 日志监控 + 构建验证

---

## 2. 测试用例

### 2.1 reportUserState 工具调用测试（高优先级）

#### 基础功能测试

| 用例 | 操作步骤 | 预期结果 | 验证方式 |
|------|---------|---------|---------|
| **T1-1** 抗拒状态检测 | 1. 开始任务<br>2. 对 AI 说"太累了，不想做" | 控制台出现 `🔧 [ToolCall] reportUserState: { state: 'resisting' }` | Console |
| **T1-2** 配合状态检测 | 1. 开始任务<br>2. 对 AI 说"好的，我去做" | 控制台出现 `✅ [ToneManager] AI 通过工具调用报告用户配合` | Console |
| **T1-3** 中性状态检测 | 1. 开始任务<br>2. 问 AI 无关问题 | 控制台出现 `state: 'neutral'` | Console |
| **T1-4** 语气切换触发 | 连续 3 次说抗拒的话 | 控制台出现 `📤 [ToneManager] 语气切换触发词已发送给 Gemini` | Console |

#### 边界和异常测试

| 用例 | 操作步骤 | 预期结果 |
|------|---------|---------|
| **T1-5** 快速连续发言 | 连续快速说 5 句话 | 每句话都应触发 `reportUserState`，无漏检 |
| **T1-6** 会话断开重连 | 断开网络后恢复 | 重连后工具调用恢复正常 |
| **T1-7** 多语言混合 | 中英文混合说话 | 正确检测抗拒状态 |

#### 日志检查清单

```bash
# Console 中过滤以下关键日志：
🔧 [ToolCall]          # 工具调用入口
🚫 [ToneManager]       # 抗拒检测
✅ [ToneManager]       # 配合检测
📤 [ToneManager]       # 语气切换发送
⚠️ [ToolCall]          # 异常/无效参数
```

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

### 2026-01-15
- [x] Phase 1 构建验证完成
  - `npm run build` 成功（3.49s）
  - `npm run lint` 有 17 errors, 9 warnings（非阻塞性）
- [x] 遗漏引用检查完成
  - 已删除模块无残留引用
- [ ] Phase 2-4 需要手动执行

**Lint 发现的问题**：
- TimePicker.tsx: `set-state-in-effect` 警告（有意为之，同步外部 props）
- 多个文件: `exhaustive-deps` 警告
- 多个文件: `no-unused-vars` 错误

---

## 4. 关键文件

| 文件 | 作用 |
|------|-----|
| `src/hooks/useAICoachSession.ts:171-223` | handleToolCall 处理逻辑 |
| `src/hooks/gemini-live/tools/userStateTools.ts` | reportUserState 工具定义 |
| `src/components/app-tabs/TimePicker.tsx` | 滚轮选择器组件 |
| `src/components/app-tabs/HomeView.tsx:739-756, 807-814` | TimePicker 使用（Modal + Embedded） |
| `src/components/app-tabs/StatsView.tsx:1083-1090` | TimePicker 使用（习惯编辑） |

---

## 5. 待办事项

- [ ] 执行 TimePicker 手动测试（T2-1 ~ T2-11）
- [ ] 执行 reportUserState 工具调用测试（T1-1 ~ T1-7）
- [ ] 执行完整流程测试（T3-1 ~ T3-3）
- [ ] 记录测试结果
- [ ] 修复发现的问题（如有）

---

## 6. 相关 commit

- `53d6b88` - 变更起点
- `f11dc99` - 当前最新（remove devlog）
- 中间包含 8 个提交，涉及 46 个文件，净减少约 6000 行代码

---

## 7. 通过标准

| 类别 | 通过条件 |
|------|---------|
| 构建 | `npm run build` 通过 |
| TimePicker | 所有 T2-x 用例通过，无视觉闪烁或错位 |
| reportUserState | 每次回复前都能看到工具调用日志 |
| 完整流程 | 能完成一次完整的任务而无 console 错误 |
