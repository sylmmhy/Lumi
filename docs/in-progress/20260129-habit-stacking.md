---
title: "习惯叠加 (Habit Stacking)"
created: 2026-01-29
updated: 2026-01-29 21:00
stage: "🚧 实现"
due: 2026-02-05
issue: ""
---

# 习惯叠加 (Habit Stacking) 实现进度

## 阶段进度
- [x] 阶段 1：需求分析与方案设计
- [x] 阶段 2：数据库迁移（表结构 + 函数）
- [x] 阶段 3：Edge Functions（AI 推荐 + 触发）
- [x] 阶段 4：功能文档
- [ ] 阶段 5：前端 UI 集成
- [ ] 阶段 6：测试验证

---

## 1. 背景与目标

### 背景
习惯叠加（Habit Stacking）是行为科学中有效的习惯养成策略：

```
After [现有习惯], I will [新习惯]
```

利用已有稳定习惯（锚点）的触发力，帮助用户养成新习惯。

### 目标
- 自动识别用户的锚点习惯（稳定的触发器）
- AI 推荐最佳挂载方案
- 锚点完成时自动触发后续习惯提醒
- 追踪成功率并自动优化

---

## 2. 方案设计

### 核心流程

```
用户想养成新习惯
    │
    ├── 1. 获取锚点习惯（完成率≥85%，≥14天数据）
    │
    ├── 2. 规则兼容性检查（时间、场景、生理）
    │
    ├── 3. Gemini 3 Flash AI 推荐
    │
    ├── 4. 用户接受建议
    │
    └── 5. 锚点完成 → 触发提醒
```

### 锚点识别条件

| 条件 | 阈值 |
|------|------|
| 数据量 | ≥ 14 天 |
| 完成率 | ≥ 85% |
| 时间稳定性 | 标准差 < 60 分钟 |

### 兼容性检查

1. **时间兼容性**：锚点后有足够时间
2. **场景兼容性**：地点、工具匹配
3. **生理/心理兼容性**：能量状态适合

---

## 3. 实现记录

### 2026-01-29 晚上

- **数据库迁移** `20260129170000_habit_stacking.sql`：
  - `habit_context_rules` - 习惯场景规则库（预置 14 条规则）
  - `habit_stacks` - 习惯链关系表
  - `anchor_habits_view` - 锚点习惯视图
  - RPC 函数：`get_anchor_habits`, `check_habit_stack_compatibility`, `create_habit_stack`, `accept_habit_stack`, `get_active_habit_stacks`, `get_stacks_for_anchor`, `record_habit_stack_trigger`

- **Edge Functions**：
  - `suggest-habit-stack/index.ts` - AI 推荐习惯挂载方案
  - `trigger-habit-stack/index.ts` - 触发习惯链提醒

- **文档**：
  - `docs/features/habit_stacking.md` - 功能文档

---

## 4. 关键文件

| 文件 | 作用 |
|------|------|
| `migrations/20260129170000_habit_stacking.sql` | 数据库迁移（表 + 函数） |
| `migrations/20260129180000_habit_stack_trigger.sql` | 数据库触发器（自动触发习惯链） |
| `functions/suggest-habit-stack/index.ts` | AI 推荐 |
| `functions/trigger-habit-stack/index.ts` | 触发提醒 |
| `docs/features/habit_stacking.md` | 功能文档 |

---

## 5. 待办事项

### 后端 ✅
- [x] 数据库：habit_context_rules（规则库）
- [x] 数据库：habit_stacks（习惯链）
- [x] 数据库：anchor_habits_view（锚点视图）
- [x] RPC：get_anchor_habits
- [x] RPC：check_habit_stack_compatibility
- [x] RPC：create_habit_stack
- [x] Edge Function：suggest-habit-stack
- [x] Edge Function：trigger-habit-stack

### 前端
- [ ] 新习惯创建时显示挂载建议
- [ ] 习惯链管理页面
- [ ] 成功率可视化

### 集成 ✅
- [x] routine_instance 完成时自动触发（数据库触发器）
- [x] 成功率自动更新（后续习惯完成时）
- [ ] 与 Goal 系统联动

### 测试
- [ ] 锚点识别准确性
- [ ] AI 推荐质量
- [ ] 提醒触发及时性

---

## 6. API 说明

### suggest-habit-stack

**请求**
```bash
curl -X POST http://127.0.0.1:54321/functions/v1/suggest-habit-stack \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d '{"new_habit": "吃维生素", "duration_minutes": 1}'
```

**响应**
```json
{
  "success": true,
  "suggestions": [
    {
      "anchor_task_id": "xxx",
      "anchor_title": "喝咖啡",
      "position": "after",
      "confidence": 0.92,
      "reasoning": "喝咖啡时手边有水",
      "reminder_text": "喝完咖啡了？别忘了吃维生素哦～"
    }
  ]
}
```

### trigger-habit-stack

**请求**
```bash
curl -X POST http://127.0.0.1:54321/functions/v1/trigger-habit-stack \
  -H "Content-Type: application/json" \
  -d '{"anchor_task_id": "xxx", "user_id": "yyy"}'
```

**响应**
```json
{
  "success": true,
  "triggered": 1,
  "habits": ["吃维生素"]
}
```

---

## 7. 环境变量

| 变量 | 说明 |
|------|------|
| `GEMINI_API_KEY` | Gemini 3 Flash API Key |
| `ONESIGNAL_APP_ID` | 推送应用 ID |
| `ONESIGNAL_API_KEY` | 推送 API Key |

---

## 8. 预置规则

已在数据库中预置 14 条常见习惯规则：

| 习惯 | good_after | bad_after |
|------|------------|-----------|
| 维生素 | 喝水、喝咖啡、刷牙 | 运动、洗澡 |
| 冥想 | 起床、洗澡、瑜伽 | 喝咖啡、运动 |
| 运动 | 起床、喝水 | 吃饭、喝咖啡 |
| 护肤 | 洗澡、洗脸 | 运动、化妆 |
| 阅读 | 喝茶、洗澡 | 运动 |
| 写日记 | 洗澡、阅读 | 起床 |
| 喝水 | 起床、运动、吃饭 | - |
| 拉伸 | 起床、运动、久坐 | - |
| 刷牙 | 起床、吃早餐 | - |
| 洗脸 | 起床、运动 | - |
| 背单词 | 起床、喝咖啡 | 睡觉、运动 |
| 整理房间 | 起床、洗澡 | 睡觉 |
| 喝咖啡 | 起床 | - |
| 散步 | 吃饭、工作 | - |

---

## 9. 相关 commit
- 待补充
