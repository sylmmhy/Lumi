# 每日目标报告 (Daily Goal Report)

## 概述

每天早上 7 点（用户本地时间），系统自动生成昨天的目标完成报告，并推送通知给用户。

## 功能特点

- **时区感知**：根据用户时区，在本地早上 7 点推送
- **AI 评分**：使用 AI 对每个目标进行智能评分（0-100）
- **个性化反馈**：根据用户的 `ai_tone` 偏好生成不同风格的反馈
- **推送通知**：通过 OneSignal 发送 iOS/Android 推送（复用现有推送方案）

## 技术实现

### 触发机制

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
    └── 发送推送（OneSignal）+ 存储 App 内通知
```

### 时区处理

**设计决策**：复用 `tasks.timezone` 字段，不新增用户时区字段。

时区信息从 `tasks.timezone` 字段获取（取用户最新创建的 task 的时区）：

```typescript
async function getUserTimezone(supabase, userId): Promise<string> {
  const { data: task } = await supabase
    .from('tasks')
    .select('timezone')
    .eq('user_id', userId)
    .not('timezone', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return task?.timezone || 'UTC';
}
```

**时区判断逻辑**：

```typescript
function isUserInTargetHour(timezone: string, targetHour: number = 7): boolean {
  const now = new Date();
  const userHour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(now)
  );
  return userHour === targetHour;
}
```

**计算用户时区的"昨天"**：

```typescript
function getYesterdayInTimezone(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = formatter.format(now);
  const today = new Date(todayStr);
  today.setDate(today.getDate() - 1);
  return today.toISOString().split('T')[0];
}
```

### 数据表

#### daily_goal_reports（每日报告主表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 用户 ID |
| report_date | DATE | 报告日期 |
| total_score | INTEGER | 综合得分 (0-100) |
| goals_completed | INTEGER | 完成的目标数 |
| goals_partial | INTEGER | 部分完成的目标数 |
| goals_failed | INTEGER | 未完成的目标数 |
| goals_total | INTEGER | 目标总数 |
| ai_summary | TEXT | AI 生成的整体寄语 |

#### daily_goal_scores（各目标评分详情）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| report_id | UUID | 关联的报告 ID |
| goal_id | UUID | 目标 ID |
| user_id | UUID | 用户 ID |
| score | INTEGER | 该目标得分 (0-100) |
| status | VARCHAR | completed/partial/failed |
| routines_data | JSONB | 各步骤完成情况 |
| ai_reasoning | TEXT | AI 评分理由（内部） |
| ai_feedback | TEXT | AI 反馈（给用户看） |

#### user_notifications（用户通知）

| 字段 | 类型 | 说明 |
|------|------|------|
| type | VARCHAR | 'daily_report' |
| data | JSONB | { total_score, goals_total } |

## Edge Function

### generate-daily-report

**路径**: `supabase/functions/generate-daily-report/index.ts`

**Cron**: `0 * * * *`（每小时整点）

**环境变量**:

```bash
# AI 评分（Gemini）
GEMINI_API_KEY=xxx

# 推送通知（可选）
ONESIGNAL_APP_ID=xxx
ONESIGNAL_API_KEY=xxx
```

> 注：这是 Gemini 黑客松项目，所有 AI 调用均使用 Gemini API（gemini-3-flash-preview 模型）

**API 参数**:

```typescript
POST /functions/v1/generate-daily-report
{
  "user_id": "可选，指定单用户",
  "date": "可选，手动指定日期 YYYY-MM-DD",
  "force": true  // 可选，强制生成（跳过时区检查）
}
```

**返回示例**:

```json
{
  "success": true,
  "timestamp": "2026-01-29T07:00:00.000Z",
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

## AI 评分逻辑

### 评分规则

1. **Gemini AI 评分**（gemini-2.0-flash）
   - 根据 routines 完成情况
   - 参考用户记忆（PREF, EFFECTIVE 标签）
   - 输出 JSON: `{ score, status, reasoning, feedback }`

2. **规则评分**（AI 不可用时的备选）
   - 完成率 >= 80%: 80-100 分, status = completed
   - 完成率 >= 50%: 50-80 分, status = partial
   - 完成率 > 0%: 0-50 分, status = partial
   - 完成率 = 0%: 0 分, status = failed

### AI 语气风格

根据 `users.ai_tone` 字段：

| ai_tone | 风格 |
|---------|------|
| gentle | 温柔鼓励，充满关怀 |
| direct | 直接了当，简洁明了 |
| humorous | 幽默搞笑，轻松愉快 |
| tough_love | 毒舌损友，用调侃激励 |

## 推送通知

### 推送方案

**复用现有的 OneSignal 推送**（和 `daily-goal-adjustment` 保持一致）

| 场景 | 推送方式 | 平台 |
|------|----------|------|
| 任务到时间来电 | VoIP / FCM | iOS / Android |
| 目标动态调整通知 | OneSignal | iOS + Android |
| **每日报告通知** | **OneSignal** | iOS + Android |

### OneSignal 配置

需要环境变量：
- `ONESIGNAL_APP_ID`
- `ONESIGNAL_API_KEY`

### 推送内容

```json
{
  "headings": "☀️ 早安！昨日回顾",
  "contents": "昨天得分 85 分，点击查看详情",
  "data": {
    "type": "daily_report",
    "total_score": 85,
    "goals_total": 3
  }
}
```

### App 内通知

同时存储到 `user_notifications` 表，用户打开 App 后可在通知中心查看。

## RPC 函数

### get_daily_report

获取用户指定日期的报告：

```sql
SELECT * FROM get_daily_report(
  p_user_id := 'user-uuid',
  p_report_date := '2026-01-28'
);
```

返回包含报告主表数据 + 各目标评分详情的 JSON。

## Cron 配置

```sql
-- 每小时整点触发
SELECT cron.schedule(
  'generate-daily-report',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/generate-daily-report',
    headers := '{"Authorization": "Bearer xxx"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
```

## 前端集成

### 报告页面

建议路由：`/report` 或 `/daily-report`

页面结构：
1. 顶部：日期 + 综合得分（大圆环）
2. AI 寄语卡片
3. 各目标得分列表（手风琴展开查看详情）
4. 底部：查看历史报告

### Hooks

```typescript
// 获取今日/指定日期报告
const { data: report } = useQuery({
  queryKey: ['daily-report', date],
  queryFn: () => supabase.rpc('get_daily_report', {
    p_user_id: userId,
    p_report_date: date
  })
});
```

## 测试

### 本地测试

```bash
# 启动本地 Supabase
cd Lumi-supabase
supabase start

# 强制为指定用户生成报告（跳过时区检查）
curl -X POST http://localhost:54321/functions/v1/generate-daily-report \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"user_id": "11111111-1111-1111-1111-111111111111", "force": true}'

# 指定日期生成
curl -X POST http://localhost:54321/functions/v1/generate-daily-report \
  -H "Authorization: Bearer xxx" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "xxx", "date": "2026-01-27", "force": true}'

# 批量模式（所有用户，根据时区判断）
curl -X POST http://localhost:54321/functions/v1/generate-daily-report \
  -H "Authorization: Bearer xxx" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 测试用户

- `xiaoming@test.local` (11111111-1111-1111-1111-111111111111) - 时区 Asia/Shanghai
- `xiaohong@test.local` (22222222-2222-2222-2222-222222222222) - 时区 Asia/Shanghai

## 相关文档

- [Goal 系统设计](./goal-system.md)
- [动态目标调整](./dynamic_goal_adjustment.md)

## 更新日志

- **2026-01-29**: 实现时区感知，从 `tasks.timezone` 获取用户时区，Cron 改为每小时触发
- **2026-01-29**: 推送改用 OneSignal，复用 `daily-goal-adjustment` 的推送方案
