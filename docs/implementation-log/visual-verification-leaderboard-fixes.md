# 视觉验证 + Leaderboard：安全修复与功能集成

**完成日期**: 2026-02-07
**分支**: dev
**关联 PRD**: `docs/prd/visual-verification-leaderboard.md`

## 背景

代码审查发现视觉验证 + Leaderboard 初版实现存在 7 个问题：SQL 注入漏洞、非原子 XP 更新（竞态条件）、CelebrationOverlay 未传递验证结果导致验证徽章永远不显示、HomeView 未集成拍照验证入口、AI 系统指令缺少视觉观察引导、好友管理无前端入口、零测试覆盖。

## 修复清单

### Fix 1: 创建 `increment_user_xp` RPC 函数 (CRITICAL)

**问题**: `verify-task-completion` 和 `award-xp` 都需要更新 users 表的 XP 字段，但没有原子化操作可用。

**方案**: 创建 PostgreSQL RPC 函数，使用 `UPDATE ... SET total_xp = COALESCE(total_xp, 0) + p_amount` 保证原子性。

**文件**:
- 新建: `Lumi-supabase/supabase/migrations/20260207110000_add_increment_user_xp_rpc.sql`
- 已部署到云端 Supabase

**参照模式**: `20260203110000_add_focus_sessions_rpc_functions.sql` 中的 `increment_focus_connection`。

### Fix 2: 修复 verify-task-completion SQL 注入 (CRITICAL)

**问题**: L197-214 的 fallback 链包含 `exec_sql` + 字符串拼接 SQL，`user_id` 和 `xpAmount` 被直接拼入查询字符串，存在 SQL 注入风险。

**方案**: 删除整个 fallback 链（含 `exec_sql` 调用和字符串拼接），替换为 `supabase.rpc('increment_user_xp', { p_user_id, p_amount })` 单一调用。

**文件**:
- 修改: `Lumi-supabase/supabase/functions/verify-task-completion/index.ts`

**验证**: grep 确认文件中不再包含 `exec_sql`、模板字符串 SQL、或字符串拼接 `UPDATE` 语句。

### Fix 3: 修复 award-xp 非原子更新 (CRITICAL)

**问题**: L157-175 使用 `SELECT total_xp → 手动计算 → UPDATE` 模式，存在 TOCTOU 竞态条件。两个并发请求可能读到相同的旧值，导致 XP 丢失。

**方案**: 删除 read-then-write 模式，替换为 `supabase.rpc('increment_user_xp', { p_user_id, p_amount })` 原子调用。

**文件**:
- 修改: `Lumi-supabase/supabase/functions/award-xp/index.ts`

**验证**: grep 确认文件中不再包含 `SELECT ... total_xp, weekly_xp` 后跟 `UPDATE` 的模式。

### Fix 4: CelebrationOverlay 传递 verification prop (CRITICAL)

**问题**: `CelebrationOverlay` 的 Pick 类型缺少 `isVerifyingTask` 和 `sessionVerificationResult` 字段，导致 `CelebrationView` 的 `verification` prop 从未被传递。VerificationBadge 组件永远不会显示。

**方案**:
1. 在 Pick 联合类型中添加 `'isVerifyingTask' | 'sessionVerificationResult'`
2. 在 `<CelebrationView>` 中传递 `verification` prop，将 coach 的验证状态映射为 CelebrationView 需要的格式

**文件**:
- 修改: `Lumi/src/components/overlays/CelebrationOverlay.tsx`

**依赖链验证**:
- `AppTabsPage` 已传递完整 coach 对象
- `useCoachController` 已导出 `isVerifyingTask` 和 `sessionVerificationResult`（L812-813）
- `CelebrationView` 的 `CelebrationViewProps` 已定义 `verification?` 字段
- `VerificationBadge` 组件已存在并可正常渲染

### Fix 5: HomeView 集成 PhotoVerificationModal (HIGH)

**问题**: 用户在 HomeView 手动完成任务后，无法通过拍照获得额外 XP。`PhotoVerificationModal` 已实现但未接入。

**方案**:
1. `TaskItem`: 添加 `onPhotoVerify` prop，已完成 + 未验证的任务显示 "+50 XP" 黄色按钮
2. `TaskGroup`: 透传 `onPhotoVerify` 给每个 `TaskItem`
3. `HomeView`: 管理 `photoVerifyTask` 状态，渲染 `PhotoVerificationModal`

**文件**:
- 修改: `Lumi/src/components/app-tabs/TaskItem.tsx`
- 修改: `Lumi/src/components/app-tabs/TaskGroup.tsx`
- 修改: `Lumi/src/components/app-tabs/HomeView.tsx`

**设计决策**: "+50 XP" 按钮替代已完成任务的时间显示。条件为 `task.completed && (!task.verification_status || task.verification_status === 'unverified')`。已验证（`verified`）或失败（`failed`）的任务恢复显示时间。

### Fix 6: AI 系统指令添加视觉观察引导 (MEDIUM)

**问题**: Lumi AI 通过摄像头能看到用户，但系统指令没有引导 AI 如何利用视觉信息确认任务完成。

**方案**: 在 `lumi-system.ts` 的模板字符串中添加 `<visual_observation>` section，引导 AI：
- 观察到任务完成迹象时自然引导确认
- 不过度描述看到的内容（隐私保护）
- 不确定时礼貌询问

**文件**:
- 修改: `Lumi-supabase/supabase/functions/_shared/prompts/lumi-system.ts`

### Fix 7: 好友管理 UI — DEFERRED

`manage-friends` Edge Function 已完整（增/删/改/查），前端 UI 作为单独任务处理。

### Fix 8: 补充核心单元测试

**新建测试文件**:

| 文件 | 框架 | 测试数 | 状态 |
|------|------|--------|------|
| `Lumi/src/hooks/gemini-live/media/__tests__/useVideoFrameBuffer.test.ts` | Vitest | 8 | 全部通过 |
| `Lumi-supabase/supabase/functions/award-xp/__tests__/index.test.ts` | Deno | 6 | 需 Deno 运行 |
| `Lumi-supabase/supabase/functions/get-leaderboard/__tests__/index.test.ts` | Deno | 7 | 需 Deno 运行 |

**useVideoFrameBuffer 测试覆盖**:
- addFrame 存储帧数据
- getRecentFrames 取最新 N 帧
- 环形缓冲区溢出后正确丢弃最旧帧
- 多次溢出循环
- clear 重置所有状态
- 默认 maxFrames=10
- 请求帧数超过可用帧数

**award-xp 测试覆盖**:
- XP 金额表正确性
- 无效 source 检测
- 多 source 累加计算
- season week 格式

**get-leaderboard 测试覆盖**:
- weekly_xp 降序排列
- is_me 标记正确
- display_name 降级逻辑（display_name → name → Anonymous）
- limit 上限 100、默认 50
- user_rank 计算
- season_ends_at 指向下周一

## 构建验证

- `npx tsc --noEmit`: 无错误
- `npx vitest run useVideoFrameBuffer`: 8/8 通过
- grep 确认无 SQL 字符串拼接残留

## 受影响的文件汇总

### 后端（Lumi-supabase）
| 文件 | 操作 |
|------|------|
| `supabase/migrations/20260207110000_add_increment_user_xp_rpc.sql` | 新建 |
| `supabase/functions/verify-task-completion/index.ts` | 修改 |
| `supabase/functions/award-xp/index.ts` | 修改 |
| `supabase/functions/_shared/prompts/lumi-system.ts` | 修改 |
| `supabase/functions/award-xp/__tests__/index.test.ts` | 新建 |
| `supabase/functions/get-leaderboard/__tests__/index.test.ts` | 新建 |

### 前端（Lumi）
| 文件 | 操作 |
|------|------|
| `src/components/overlays/CelebrationOverlay.tsx` | 修改 |
| `src/components/app-tabs/TaskItem.tsx` | 修改 |
| `src/components/app-tabs/TaskGroup.tsx` | 修改 |
| `src/components/app-tabs/HomeView.tsx` | 修改 |
| `src/hooks/gemini-live/media/__tests__/useVideoFrameBuffer.test.ts` | 新建 |

## 遗留项

1. **好友管理 UI** (Fix 7): `manage-friends` Edge Function 已就绪，需实现搜索/邀请/接受/拒绝的前端界面
2. **Edge Function 部署**: `verify-task-completion` 和 `award-xp` 修改后需重新部署到云端
3. **Deno 测试运行**: `award-xp` 和 `get-leaderboard` 的测试需配置 Deno 测试环境
