---
title: "习惯叠加 (Habit Stacking)"
created: 2026-01-29
updated: 2026-01-29
version: "1.0"
---

# 习惯叠加 (Habit Stacking) 功能文档

## 1. 概述

习惯叠加是一种基于行为科学的习惯养成策略，核心公式为：

```
After [现有习惯], I will [新习惯]
```

Lumi 通过识别用户已有的稳定习惯（锚点习惯），将新习惯"挂载"在其前后，利用已有习惯的触发力来帮助养成新习惯。

## 2. 核心概念

### 2.1 锚点习惯 (Anchor Habit)

满足以下条件的习惯可作为锚点：

| 条件 | 阈值 |
|------|------|
| 数据量 | ≥ 14 天记录 |
| 完成率 | ≥ 85% |
| 时间稳定性 | 标准差 < 60 分钟 |

**锚点评分公式**：
```
anchor_score = completion_rate × 0.5 
             + time_stability × 0.3 
             + data_volume × 0.2
```

### 2.2 挂载位置 (Position)

| 位置 | 说明 | 适用场景 |
|------|------|----------|
| `after` | 锚点完成后触发 | 大多数场景 |
| `before` | 锚点开始前触发 | 准备类习惯 |

### 2.3 兼容性检查

三个维度：

1. **时间兼容性**：锚点后是否有足够时间
2. **场景兼容性**：地点、工具、姿势是否匹配
3. **生理/心理兼容性**：能量状态、注意力是否适合

## 3. 数据模型

### 3.1 习惯场景规则表 (habit_context_rules)

预定义的习惯挂载规则库：

```sql
CREATE TABLE habit_context_rules (
  id UUID PRIMARY KEY,
  habit_keyword TEXT UNIQUE,        -- 习惯关键词
  location TEXT[],                  -- 适用地点
  energy_required TEXT,             -- 能量需求
  tools_needed TEXT[],              -- 所需工具
  posture TEXT,                     -- 姿势
  good_after TEXT[],                -- 适合挂载在这些习惯之后
  bad_after TEXT[],                 -- 不适合挂载在这些习惯之后
  good_before TEXT[],               -- 适合挂载在这些习惯之前
  typical_duration_minutes INTEGER, -- 典型时长
  best_time_of_day TEXT[]           -- 最佳时段
);
```

**预置规则示例**：

| 习惯 | good_after | bad_after | 说明 |
|------|------------|-----------|------|
| 维生素 | 喝水、喝咖啡、刷牙 | 运动、洗澡 | 需要水，不适合运动后 |
| 冥想 | 起床、洗澡、瑜伽 | 喝咖啡、运动 | 需要安静，咖啡因不利 |
| 护肤 | 洗澡、洗脸 | 运动、化妆 | 皮肤湿润时最佳 |

### 3.2 习惯链关系表 (habit_stacks)

```sql
CREATE TABLE habit_stacks (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  
  -- 关系
  anchor_task_id UUID REFERENCES tasks(id),   -- 锚点习惯
  stacked_task_id UUID REFERENCES tasks(id),  -- 被挂载的习惯
  position TEXT,                               -- 'before' | 'after'
  
  -- 推荐信息
  suggested_by TEXT,              -- 'ai' | 'user' | 'system'
  confidence_score NUMERIC(3,2),  -- 置信度
  reasoning TEXT,                 -- 推荐理由
  
  -- 状态
  status TEXT,                    -- 'suggested' | 'accepted' | 'rejected'
  
  -- 效果追踪
  success_count INTEGER,
  total_trigger_count INTEGER,
  success_rate NUMERIC(3,2),
  
  -- 提醒设置
  reminder_enabled BOOLEAN,
  reminder_delay_seconds INTEGER,
  reminder_message TEXT
);
```

### 3.3 锚点习惯视图 (anchor_habits_view)

自动识别用户的稳定习惯：

```sql
CREATE VIEW anchor_habits_view AS
SELECT 
  task_id,
  user_id,
  title,
  completion_rate,
  time_variance_minutes,
  anchor_score,
  is_valid_anchor
FROM routine_stats
WHERE total_instances >= 14 
  AND completion_rate >= 0.85;
```

## 4. API 接口

### 4.1 获取习惯挂载建议

```bash
POST /functions/v1/suggest-habit-stack
Authorization: Bearer <user_token>
Content-Type: application/json

{
  "new_habit": "吃维生素",
  "duration_minutes": 1
}
```

**响应**：

```json
{
  "success": true,
  "new_habit": {
    "title": "吃维生素",
    "duration_minutes": 1
  },
  "anchors": [
    {
      "task_id": "xxx",
      "title": "喝咖啡",
      "completion_rate": 94,
      "avg_time": "08:15",
      "anchor_score": 0.89
    }
  ],
  "suggestions": [
    {
      "anchor_task_id": "xxx",
      "anchor_title": "喝咖啡",
      "position": "after",
      "confidence": 0.92,
      "reasoning": "喝咖啡时手边有水，适合顺便吃维生素",
      "reminder_text": "喝完咖啡了？别忘了吃维生素哦～",
      "time_info": "建议在 08:20 左右执行"
    }
  ],
  "message": "找到 1 个适合挂载「吃维生素」的时机"
}
```

### 4.2 触发习惯链提醒

当锚点习惯完成时调用：

```bash
POST /functions/v1/trigger-habit-stack
Content-Type: application/json

{
  "anchor_task_id": "xxx",
  "user_id": "yyy"
}
```

**响应**：

```json
{
  "success": true,
  "triggered": 1,
  "habits": ["吃维生素"],
  "message": "已触发 1 个后续习惯提醒"
}
```

### 4.3 数据库 RPC 函数

```sql
-- 获取用户的锚点习惯
SELECT * FROM get_anchor_habits('user-uuid');

-- 检查习惯兼容性
SELECT check_habit_stack_compatibility(
  'anchor-task-uuid',
  '冥想',
  10
);

-- 创建习惯链
SELECT create_habit_stack(
  'user-uuid',
  'anchor-task-uuid',
  'stacked-task-uuid',
  'after',
  0.92,
  'AI 推荐理由',
  'ai',
  '喝完咖啡了？别忘了吃维生素哦～'
);

-- 用户接受建议
SELECT accept_habit_stack('user-uuid', 'stack-uuid');

-- 获取激活的习惯链
SELECT * FROM get_active_habit_stacks('user-uuid');

-- 获取锚点触发的所有习惯
SELECT * FROM get_stacks_for_anchor('anchor-task-uuid');
```

## 5. AI 推荐策略

使用 **Gemini 3 Flash** 生成个性化推荐：

### 5.1 输入

- 用户的锚点习惯列表（含完成率、时间等）
- 用户记忆（偏好、生活背景）
- 规则库兼容性检查结果
- 新习惯信息

### 5.2 Prompt 结构

```
你是习惯养成专家 Lumi，用户想培养新习惯「{new_habit}」。

【用户已有的稳定习惯（锚点候选）】
{anchors_info}

【用户偏好和生活背景】
{memories_info}

请基于行为科学原理（习惯叠加 Habit Stacking），推荐最佳挂载方案。

考虑因素：
1. 时间相容性
2. 场景相容性
3. 生理/心理兼容性
4. 自然关联性

返回 JSON：[{ anchor_index, position, confidence, reasoning, reminder_text }]
```

### 5.3 降级策略

当 Gemini API 不可用时，使用规则库进行匹配：

1. 检查 `good_after` / `bad_after` 规则
2. 按 `anchor_score` 排序
3. 返回兼容性 ≥ 0.6 的建议

## 6. 用户交互流程

```
┌─────────────────────────────────────────────────┐
│  用户：我想养成每天吃维生素的习惯               │
├─────────────────────────────────────────────────┤
│  Lumi：好的！让我看看你的日常安排... 🔍         │
│                                                 │
│  我发现你每天早上 8:15 左右都会喝咖啡，         │
│  而且已经坚持了 47 天，完成率 94%！☕            │
│                                                 │
│  我建议把「吃维生素」挂在「喝咖啡」之后：       │
│                                                 │
│  ☕ 喝咖啡 → 💊 吃维生素                        │
│                                                 │
│  这样你喝咖啡时就会自然想起来～                 │
│  要试试吗？                                     │
├─────────────────────────────────────────────────┤
│  用户：好的                                     │
├─────────────────────────────────────────────────┤
│  Lumi：太棒了！我帮你设置好了。                 │
│  明天喝完咖啡后，我会轻轻提醒你～               │
└─────────────────────────────────────────────────┘
```

## 7. 成功率追踪

### 7.1 触发记录

每次锚点完成时：

```sql
-- 记录触发
UPDATE habit_stacks SET
  total_trigger_count = total_trigger_count + 1,
  last_triggered_at = NOW()
WHERE anchor_task_id = 'xxx';
```

### 7.2 成功确认

当后续习惯也完成时：

```sql
-- 更新成功率
UPDATE habit_stacks SET
  success_count = success_count + 1,
  success_rate = success_count::NUMERIC / total_trigger_count
WHERE id = 'stack-id';
```

### 7.3 自动优化

每周分析：

```sql
-- 找出成功率低于 50% 的习惯链
SELECT * FROM habit_stacks
WHERE status = 'accepted'
  AND total_trigger_count >= 7
  AND success_rate < 0.5;
```

对于低成功率的习惯链，建议用户：
- 调整挂载位置
- 更换锚点习惯
- 调整提醒时间

## 8. 文件清单

| 文件 | 作用 |
|------|------|
| `migrations/20260129170000_habit_stacking.sql` | 数据库迁移（表 + 函数） |
| `migrations/20260129180000_habit_stack_trigger.sql` | 数据库触发器 |
| `functions/suggest-habit-stack/index.ts` | AI 推荐 Edge Function |
| `functions/trigger-habit-stack/index.ts` | 触发提醒 Edge Function |
| `docs/features/habit_stacking.md` | 本文档 |

## 9. 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `GEMINI_API_KEY` | Gemini 3 Flash API Key | AI 推荐需要 |
| `ONESIGNAL_APP_ID` | OneSignal 应用 ID | 推送需要 |
| `ONESIGNAL_API_KEY` | OneSignal API Key | 推送需要 |

## 10. 未来扩展

- [ ] 支持多级链式叠加（A → B → C）
- [ ] 时间窗口智能调整
- [ ] 基于成功率的自动优化
- [ ] 习惯链可视化图谱
- [ ] 与 Goal 系统深度集成
