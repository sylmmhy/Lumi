# PRD: 视觉验证 + Leaderboard 系统

**文档版本**: v1.0
**创建日期**: 2026-02-07
**产品负责人**: [待填写]
**开发负责人**: [待填写]

---

## 0. 部署安全原则

> **核心规则：先本地验证，后云端部署。**

| 原则 | 说明 |
|------|------|
| **本地优先** | 所有数据库迁移必须先在本地 Supabase 验证通过 |
| **禁止盲推** | 未经本地测试的 SQL 不得推送到云端 |
| **备份意识** | 云端操作是实时生效的，ALTER TABLE 等结构变更要先验证 |
| **分步部署** | 先部署 schema 变更，再部署 Edge Functions，最后部署前端 |
| **回滚方案** | 每个迁移文件都要有对应的回滚策略（注释在文件末尾） |

**正确的部署流程**：
1. 创建迁移文件 → 本地 `supabase db push --local` → 验证
2. 确认无误 → 用 MCP `apply_migration` 推送到云端
3. 部署 Edge Functions → 测试 → 上线前端

---

## 1. 背景与问题

### 1.1 当前状态
- Leaderboard Tab 处于 "Coming Soon" 状态（`LeaderboardView.tsx` L127-137 有蒙层遮挡）
- 使用硬编码的 mock 数据（L19-28）
- 任务完成仅依赖用户自我报告，缺乏可信数据源

### 1.2 用户痛点

| 痛点 | 具体表现 | 影响 |
|------|---------|------|
| **缺乏社交激励** | 无法看到其他用户的进度 | 缺少竞争/社群动力 |
| **完成数据不可信** | 仅靠自我报告，无法验证 | 排行榜数据没有意义 |
| **无成就系统** | 完成任务没有积分/奖励 | 缺乏长期激励 |

### 1.3 竞品参考
- **Duolingo**：XP + 联赛排行榜，每周赛季
- **Forest**：累计种树，好友排行
- **BeReal**：拍照验证真实性

---

## 2. 产品目标

### 2.1 核心目标
> **通过视觉验证增加任务完成的可信度，用 XP 积分系统驱动排行榜，形成社交激励闭环。**

**核心原则**：视觉验证是 XP 加成奖励，**永远不阻塞任务完成**。

### 2.2 量化指标

| 指标 | 当前基准 | 目标 | 衡量方式 |
|------|---------|------|---------|
| 日活跃用户中使用排行榜的比例 | 0%（Coming Soon） | 30% | 排行榜 Tab 访问率 |
| 任务完成后的验证率 | N/A | 40% | 有验证记录的完成任务比例 |
| 周留存率 | 待测量 | +15% | 周赛季制度带来的回访 |

---

## 3. 功能方案

### 3.1 In-Session 视觉验证

**触发时机**：用户点击 "I'M DOING IT!" 或倒计时结束

**流程**：
```
用户开始 Session → 摄像头帧流到 Gemini Live
       │
       ├─ 帧同时存入 Ring Buffer（最近 10 帧）
       │
       └─ 用户点击 "I'M DOING IT!" / Timer 到期
           └─ 抓取 Ring Buffer 最近 5 帧（在 endSession 前！）
           └─ fire-and-forget 调用 verify-task-completion
           └─ CelebrationView 显示验证徽章 + 额外 XP
```

**关键规则**：
- ✅ 验证是异步的，不阻塞庆祝流程
- ✅ 帧抓取必须在 `endSession()` **之前**执行（之后摄像头已关闭）
- ✅ 验证失败时静默处理，不展示错误
- ✅ 不可视觉验证的任务（如"冥想"）自动通过

### 3.2 Out-of-Session 拍照验证

**触发时机**：用户在 HomeView 手动勾选任务完成后

**流程**：
```
任务卡片显示 "📸 +50 XP" 按钮
   └─ 用户点击 → 打开相机/相册
   └─ 拍照 → base64 → 调用 verify-task-completion
   └─ 验证通过 → 任务显示 ✅ 徽章 + 发放额外 XP
```

### 3.3 XP 积分系统

| 来源 | XP 数量 | 说明 |
|------|---------|------|
| task_complete | 100 | 完成任务 |
| session_complete | 50 | 完成 AI Coach Session |
| visual_verification | 50 | In-Session 视觉验证通过 |
| photo_verification | 50 | Out-of-Session 拍照验证通过 |
| streak_bonus | 25 | 连续 3 天+ 完成任务 |
| resistance_bonus | 30 | 克服阻力完成任务 |

**赛季制度**：每周一 00:00 UTC 重置 `weekly_xp`，`total_xp` 永不重置。

### 3.4 排行榜

**视觉效果**：
```
┌─────────────────────────────────────┐
│  🏆 You Are The Best!               │  ← Hero（保持现有风格）
├─────────────────────────────────────┤
│  Today: +150 XP  |  Season: 3d left │  ← Stats Box
├─────────────────────────────────────┤
│  [Public]  [Friends]                 │  ← Tabs
├─────────────────────────────────────┤
│  🥇 Parrot     37,327 XP            │
│  🥈 3H ←(你)   30,530 XP  ← 高亮   │
│  🥉 Past       10,831 XP            │
│  4. Old Gao    10,632 XP            │
│  ...                                │
└─────────────────────────────────────┘
```

**交互说明**：
| 场景 | 表现 |
|------|------|
| Public Tab | 全部用户按 weekly_xp 排名 |
| Friends Tab | 好友按 weekly_xp 排名 / 无好友时显示邀请 CTA |
| 当前用户不在 Top 50 | 列表底部追加显示用户自己的排名 |
| 赛季结束 | weekly_xp 重置为 0，新赛季开始 |

---

## 4. 技术方案

### 4.1 数据库变更（优先扩展现有表）

**扩展 `tasks` 表**：
```sql
ALTER TABLE public.tasks
  ADD COLUMN verification_status TEXT DEFAULT 'unverified',
  ADD COLUMN verification_confidence REAL,
  ADD COLUMN verification_evidence TEXT;
```

**扩展 `users` 表**：
```sql
ALTER TABLE public.users
  ADD COLUMN total_xp INTEGER DEFAULT 0,
  ADD COLUMN weekly_xp INTEGER DEFAULT 0,
  ADD COLUMN streak_days INTEGER DEFAULT 0,
  ADD COLUMN last_xp_date DATE,
  ADD COLUMN avatar_emoji TEXT;
```
> 注：`display_name` 已存在，无需添加。

**新建 `xp_ledger` 表**（不可变追加日志，必须独立）：
```sql
CREATE TABLE public.xp_ledger (...);
```

**新建 `user_friends` 表**（双向关系，必须独立）：
```sql
CREATE TABLE public.user_friends (...);
```

### 4.2 后端 Edge Functions

| 函数 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `verify-task-completion` | frames[], task_id | verified, confidence | Gemini Flash 视觉分析 |
| `award-xp` | user_id, sources[] | xp_awarded, breakdown | XP 发放（去重） |
| `get-leaderboard` | user_id, type | rankings[], user_rank | 排行榜查询 |
| `manage-friends` | action, friend_id | result | 好友管理 CRUD |
| `reset-weekly-xp` | (cron) | affected_count | 周 XP 重置 |

### 4.3 前端变更

**新文件**：
- `useVideoFrameBuffer.ts` - 帧环形缓冲区
- `useTaskVerification.ts` - 验证 API 客户端
- `useXP.ts` - XP 发放
- `useLeaderboard.ts` - 排行榜数据
- `VerificationBadge.tsx` - 验证状态徽章
- `PhotoVerificationModal.tsx` - 拍照验证弹窗

**修改文件**：
- `useGeminiLive.ts` - 集成帧缓冲区
- `useAICoachSession.ts` - 传递 getRecentFrames
- `useCoachController.ts` - 验证+XP 集成到完成流
- `CelebrationView.tsx` - 添加验证徽章
- `LeaderboardView.tsx` - 重写为真实数据
- `HomeView.tsx` - 验证入口按钮
- `types.ts` - 添加 verification_status 字段
- `*.json` (6 个 locale) - i18n 新增 key

---

## 5. 用户故事

### 故事 1：In-Session 验证
> 小明开始了"清理桌面"的 AI Coach Session。摄像头开着，AI 看到他在整理。5 分钟后小明点击 "I'M DOING IT!"，庆祝页面弹出。几秒后，一个绿色 ✅ 徽章出现："+50 XP Visual Verified!"。小明感到这个验证很酷。

### 故事 2：拍照验证
> 小红在家手动勾选了"做早操"完成。任务卡片出现 "📸 +50 XP" 按钮。她点击拍了张运动后的照片。验证通过后，任务显示验证徽章，小红获得额外 50 XP。

### 故事 3：排行榜竞争
> 小张打开排行榜，看到自己排名第 5。他注意到第 4 名只领先 200 XP。于是他完成了一个任务并拍照验证，获得 200 XP（100 任务 + 50 session + 50 验证），成功升到第 4。

---

## 6. 风险与缓解

| 风险 | 严重性 | 缓解方案 |
|------|--------|---------|
| Gemini Flash 视觉分析准确率不够 | 中 | 宽松阈值 (0.6)；不可视觉验证的任务自动通过 |
| 帧抓取时机不对（endSession 后摄像头已关） | 高 | 在 endSession **前**抓取帧 |
| XP 膨胀/作弊 | 低 | 去重机制 + 周赛季重置 |
| 低分辨率帧（160x120）影响验证 | 中 | Prompt 强调"活动迹象"而非细节 |
| 云端迁移破坏现有数据 | 高 | **先本地验证，后云端部署** |

---

## 7. 验收标准

### 功能验收
- [ ] In-Session 验证：完成 Session 后 CelebrationView 显示验证徽章
- [ ] Out-of-Session 验证：拍照后任务显示验证状态
- [ ] XP 系统：完成任务后 xp_ledger 有记录，users.total_xp 更新
- [ ] 排行榜：显示真实数据，Public/Friends 切换正常
- [ ] 去重：同一任务不重复发放 XP

### 数据库验收
```sql
-- 验证记录
SELECT task_id, verification_status, verification_confidence
FROM tasks WHERE verification_status != 'unverified';

-- XP 发放
SELECT * FROM xp_ledger ORDER BY created_at DESC LIMIT 20;

-- 排行榜
SELECT id, display_name, weekly_xp, total_xp
FROM users ORDER BY weekly_xp DESC LIMIT 10;
```

---

## 8. 排期

| 阶段 | 内容 | 依赖 |
|------|------|------|
| Phase 1 | 数据库 Schema 变更 | 无 |
| Phase 2 | 后端 Edge Functions | Phase 1 |
| Phase 3 | 前端 Hooks | Phase 1 |
| Phase 4 | In-Session 验证集成 | Phase 2 + 3 |
| Phase 5 | Out-of-Session 拍照验证 | Phase 2 + 3 |
| Phase 6 | Leaderboard 激活 + i18n | Phase 2 |

---

## 9. 附录

### 9.1 修订记录

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|---------|------|
| v1.0 | 2026-02-07 | 初稿 | Claude |
