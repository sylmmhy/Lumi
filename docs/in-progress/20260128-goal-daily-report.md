---
title: "Goal 系统与每日报告"
created: 2026-01-29
updated: 2026-01-29 20:00
stage: "🚧 实现"
due: 2026-02-05
issue: ""
---

# Goal 系统与每日报告 实现进度

## 阶段进度
- [x] 阶段 1：需求分析
- [x] 阶段 2：方案设计
- [x] 阶段 3：核心实现（数据库 + Edge Function）
- [x] 阶段 4：时区支持 + 推送集成
- [x] 阶段 5：Cron Job 配置
- [ ] 阶段 6：前端实现
- [ ] 阶段 7：测试验证

---

## 1. 背景与目标

### 背景
用户设定 Life Goal（如"早睡"），系统会分解成多个 Routine 步骤（如"刷牙"、"洗澡"、"上床睡觉"）。需要：
1. 将 Goal 的步骤关联到 tasks 表（触发 VoIP 来电）
2. 每天早上生成"昨日回顾"报告，AI 评分并给出反馈
3. 推送通知用户查看报告

### 目标
- 用户能看到每天的目标完成报告
- AI 对每个 Goal 进行评分（0-100）并给出个性化反馈
- 未完成的 Goal 用灰色样式展示，但仍然显示
- 没有设置任何 Goal 的用户不发送推送

---

## 2. 方案设计

### 核心概念

```
Goal: "早睡" (goals 表)
    │
    └── 关联多个 Routine (goal_routines 表)
        ├── task_id → tasks 表 (task_type='routine')
        ├── task_id → tasks 表
        └── task_id → tasks 表
                │
                └── 每天生成 routine_instance → 触发来电
```

### 时区处理

```
Cron 每小时触发 (0 * * * *)
    │
    ├── 遍历所有有活跃 Goal 的用户
    │
    ├── 获取用户时区（从 tasks 表最新的 task.timezone）
    │
    ├── 判断：用户时区现在是早上 7 点吗？
    │   ├── 是 → 计算用户时区的"昨天"，生成报告
    │   └── 否 → 跳过
    │
    └── 发送推送（OneSignal）
```

### 推送方案

| 场景 | 推送方式 | 平台 |
|------|----------|------|
| 任务到时间来电 | VoIP / FCM | iOS / Android |
| 目标动态调整通知 | OneSignal | iOS + Android |
| **每日报告通知** | **OneSignal** | iOS + Android |

### UI 设计（抽屉模式）

```
┌─────────────────────────────────────────┐
│  ☀️ 早安！昨日回顾                       │
│  2026年1月29日                           │
├─────────────────────────────────────────┤
│  📊 综合得分：78/100                     │
│  ████████░░ 完成 2/3 个目标              │
├─────────────────────────────────────────┤
│  ▶ 早睡        85分 ✅                  │  ← 点击展开
│  ▶ 健身        92分 ✅                  │
│  ▶ 学英语       0分 ━━                  │  ← 灰色样式
└─────────────────────────────────────────┘

展开后：
┌─────────────────────────────────────────┐
│  ▼ 早睡        85分 ✅                  │
├─────────────────────────────────────────┤
│  完成步骤：                              │
│  ✅ 刷牙 10:30pm                        │
│  ✅ 洗澡 10:45pm                        │
│  ⏭️ 敷面膜（跳过）                       │
│  ✅ 上床 11:15pm                        │
│                                         │
│  💬 AI 点评：                            │
│  "比昨天提前了30分钟上床，进步很明显！"   │
└─────────────────────────────────────────┘
```

---

## 3. 实现记录

### 2026-01-29 上午
- 完成数据库迁移文件：
  - `20260129150000_goal_task_integration.sql`
  - 修改 goal_routines 添加 task_id 关联
  - 修改 goal_entries 添加 AI 评分字段
  - 新建 daily_goal_reports 和 daily_goal_scores 表
  - 新建 RPC 函数 get_daily_report, get_goal_routines_with_tasks
- 完成 Edge Function：
  - `generate-daily-report/index.ts`

### 2026-01-29 下午
- **时区支持**：
  - 从 `tasks.timezone` 获取用户时区（取最新 task）
  - 函数：`getUserTimezone()`, `isUserInTargetHour()`, `getYesterdayInTimezone()`
  - Cron 改为每小时触发，根据用户时区判断是否生成报告
- **推送集成**：
  - 复用 OneSignal（和 daily-goal-adjustment 保持一致）
  - 支持 iOS + Android 推送
- **Cron 配置**：
  - 新增迁移 `20260129160000_daily_report_cron.sql`
  - 创建 `trigger_daily_report_generation()` 函数
  - 创建 `manual_daily_report_generation()` 手动触发函数
  - 配置 cron job: `generate_daily_report_hourly`（每小时整点）
- **文档更新**：
  - 创建 `docs/features/daily_goal_report.md`

### 下一步
- [ ] 前端 UI 实现（早安报告页面）
- [ ] 端到端测试

---

## 4. 关键文件

| 文件 | 作用 |
|------|------|
| `migrations/20260129110000_create_goals_tables.sql` | Goals 相关表（已有） |
| `migrations/20260129150000_goal_task_integration.sql` | Goal-Task 关联 + 每日报告表 |
| `migrations/20260129160000_daily_report_cron.sql` | Cron Job 配置 |
| `functions/generate-daily-report/index.ts` | 生成每日报告的 Edge Function |
| `functions/daily-goal-adjustment/index.ts` | 目标动态调整（已有） |
| `docs/features/daily_goal_report.md` | 功能文档 |

---

## 5. 待办事项

### 后端 ✅
- [x] 数据库迁移：goal_routines 添加 task_id
- [x] 数据库迁移：daily_goal_reports / daily_goal_scores 表
- [x] Edge Function：generate-daily-report
- [x] 时区支持（从 tasks.timezone 获取）
- [x] 推送集成（OneSignal）
- [x] Cron Job 配置迁移

### 部署
- [ ] 运行迁移 `20260129160000_daily_report_cron.sql`
- [ ] 验证 cron job 创建成功
- [ ] OneSignal 环境变量确认

### 前端
- [ ] 早安报告页面组件
- [ ] 抽屉展开/收起动画
- [ ] 灰色样式（未完成的 Goal）
- [ ] 推送点击跳转

### 测试
- [ ] 本地测试 AI 评分
- [ ] 测试时区逻辑（不同时区用户）
- [ ] 测试无 Goal 用户不发推送
- [ ] 测试多 Goal 用户报告生成

---

## 6. Cron Job 配置

### 迁移文件
`migrations/20260129160000_daily_report_cron.sql`

### Cron 任务详情

| 项目 | 说明 |
|------|------|
| **任务名称** | `generate_daily_report_hourly` |
| **执行频率** | `0 * * * *`（每小时整点） |
| **触发函数** | `trigger_daily_report_generation()` |
| **手动触发** | `manual_daily_report_generation(user_id, date, force)` |

### 部署后验证

```sql
-- 检查 cron 任务是否创建成功
SELECT jobid, jobname, schedule, command FROM cron.job;

-- 查看 cron 执行历史
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'generate_daily_report_hourly')
ORDER BY start_time DESC
LIMIT 10;
```

### 手动触发（测试）

```sql
-- 为指定用户强制生成报告
SELECT manual_daily_report_generation(
  p_user_id := '11111111-1111-1111-1111-111111111111',
  p_force := true
);

-- 指定日期生成
SELECT manual_daily_report_generation(
  p_user_id := '11111111-1111-1111-1111-111111111111',
  p_date := '2026-01-28',
  p_force := true
);

-- 全量触发（所有用户，根据时区判断）
SELECT manual_daily_report_generation(p_force := false);
```

### 删除/重新配置 Cron

```sql
-- 删除 cron 任务
SELECT cron.unschedule('generate_daily_report_hourly');

-- 重新创建（修改执行时间为每 30 分钟）
SELECT cron.schedule(
  'generate_daily_report_hourly',
  '0,30 * * * *',
  $$SELECT trigger_daily_report_generation()$$
);
```

---

## 7. API 说明

### generate-daily-report

**请求**
```bash
# Cron 调用（每小时），根据时区自动判断
curl -X POST http://127.0.0.1:54321/functions/v1/generate-daily-report \
  -H "Authorization: Bearer <service_role_key>"

# 强制为指定用户生成（调试用）
curl -X POST http://127.0.0.1:54321/functions/v1/generate-daily-report \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "xxx", "force": true}'

# 指定日期
curl -X POST http://127.0.0.1:54321/functions/v1/generate-daily-report \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "xxx", "date": "2026-01-28", "force": true}'
```

**响应**
```json
{
  "success": true,
  "timestamp": "2026-01-29T07:00:00Z",
  "summary": {
    "total_users": 100,
    "skipped": 85,
    "processed": 15,
    "generated": 15
  },
  "results": [
    {
      "user_id": "xxx",
      "timezone": "Asia/Shanghai",
      "success": true,
      "report_id": "yyy"
    },
    {
      "user_id": "zzz",
      "timezone": "America/New_York",
      "skipped_reason": "用户时区当前不是 7 点"
    }
  ]
}
```

### get_daily_report (RPC)

**请求**
```sql
SELECT get_daily_report('user-uuid', '2026-01-28');
```

**响应**
```json
{
  "success": true,
  "report": {
    "id": "xxx",
    "report_date": "2026-01-28",
    "total_score": 78,
    "goals_completed": 2,
    "goals_partial": 0,
    "goals_failed": 1,
    "goals_total": 3,
    "ai_summary": "昨天表现很棒！"
  },
  "scores": [
    {
      "goal_id": "xxx",
      "goal_name": "早睡",
      "score": 85,
      "status": "completed",
      "routines_data": [...],
      "ai_feedback": "比昨天提前了30分钟..."
    }
  ]
}
```

---

## 8. 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `GEMINI_API_KEY` | Gemini API Key | AI 评分需要 |
| `ONESIGNAL_APP_ID` | OneSignal 应用 ID | 推送需要 |
| `ONESIGNAL_API_KEY` | OneSignal API Key | 推送需要 |

> 注：这是 Gemini 黑客松项目，所有 AI 调用均使用 Gemini API（gemini-3-flash-preview 模型）

---

## 9. 相关 commit
- 待补充
