# 用户行为分析 AI Agent 设计方案

> **状态**: 设计确认（研究增强版）
> **创建日期**: 2026-02-03
> **更新日期**: 2026-02-05
> **作者**: Claude + Sophia

---

## 0. 已确认的产品决策

| 决策项 | 结论 |
|-------|------|
| **报告内容** | 总结回顾 + 洞察建议（两者结合） |
| **推送时间** | 早上（如周一早 8 点） |
| **推送频率** | 每周一次（MVP） |
| **推送系统** | 复用现有 VoIP/FCM |
| **AI 模型** | Gemini Flash（成本低、速度快） |

---

## 1. 愿景

构建一个**后台运行的 AI Agent**，持续分析用户行为数据，生成个性化洞察和策略建议，并通过推送/报告的形式触达用户。

**核心价值**：让用户在不主动查看 App 的情况下，也能收到有价值的、个性化的反馈和建议。

---

## 1.5 研究理论基础 🆕

### 1.5.1 ADHD干预的循证框架

本方案的干预策略基于最新的ADHD研究文献，主要参考以下核心研究：

| 研究领域 | 关键发现 | 应用到Lumi |
|---------|---------|-----------|
| **认知行为疗法 (CBT)** | CBT显著改善核心症状和情绪症状（效果量0.43-0.76），6周期与12周期同样有效[^1][^2] | AI生成的建议采用CBT框架 |
| **执行功能训练** | 工作记忆、抑制控制、认知灵活性是干预获益最多的功能[^3] | 针对性追踪这三项执行功能 |
| **正念干预** | 正念可改善ADHD症状和功能结果，尤其适合成人[^4] | 情绪觉察和自我调节建议 |
| **数字疗法** | 数字干预可提高治疗可及性和依从性[^5] | 推送系统的设计理念 |
| **运动干预** | 中等强度、60-90分钟的运动对执行功能改善最佳[^6] | 健康数据整合分析 |
| **行为激活** | 帮助ADHD患者克服拖延和被动[^7] | 任务完成策略建议 |

### 1.5.2 个性化干预的重要性

研究表明：
- 约70-80%的ADHD患者对药物治疗有反应，但需要结合非药物干预[^8]
- 多学科方法整合药物、行为疗法和创新技术，可改善患者预后[^9]
- 数字健康干预可促进共同调节、捕获患者数据、支持高效医疗服务[^10]

### 1.5.3 关键参考文献

[^1]: Liu et al. (2023). "Effectiveness of cognitive behavioural-based interventions for adults with ADHD extends beyond core symptoms: A meta-analysis" - *Psychology and Psychotherapy* [链接](https://pubmed.ncbi.nlm.nih.gov/36794797/)

[^2]: Corrales et al. (2023). "Long-term efficacy of a new 6-session CBT for adults with ADHD" - *Psychiatry Research* [链接](https://www.sciencedirect.com/science/article/abs/pii/S0165178123005929)

[^3]: Ramos-Galarza et al. (2024). "Systematic Review of Executive Function Stimulation Methods in the ADHD Population" - *Journal of Clinical Medicine* [链接](https://pmc.ncbi.nlm.nih.gov/articles/PMC11278469/)

[^4]: PMC (2025). "Mindfulness-based interventions for adults with ADHD: A systematic review and meta-analysis" [链接](https://pmc.ncbi.nlm.nih.gov/articles/PMC12440486/)

[^5]: Zhao et al. (2024). "A Digital Cognitive-Physical Intervention for ADHD: Randomized Controlled Trial" - *JMIR* [链接](https://www.jmir.org/2024/1/e55569)

[^6]: Yang et al. (2024). "Effect of aerobic exercise on executive function in children with ADHD" - *Frontiers in Psychology* [链接](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1376354/full)

[^7]: Strålin et al. (2025). "CBT for ADHD predominantly inattentive presentation: RCT of two psychological treatments" - *Frontiers in Psychiatry* [链接](https://www.frontiersin.org/journals/psychiatry/articles/10.3389/fpsyt.2025.1564506/full)

[^8]: MDPI (2025). "Analysis of Digital Therapeutic Interventions on Attention and Working Memory in ADHD Children" [链接](https://www.mdpi.com/2076-3417/15/2/788)

[^9]: PMC (2024). "New frontiers in pharmacological treatment of ADHD" [链接](https://pmc.ncbi.nlm.nih.gov/articles/PMC12552245/)

[^10]: Lakes et al. (2024). "Digital health intervention for children with ADHD to improve mental health intervention" - *BMC Digital Health* [链接](https://bmcdigitalhealth.biomedcentral.com/articles/10.1186/s44247-024-00134-4)

---

## 2. 产品场景

### 2.1 用户痛点

| 痛点 | 现状 | 期望 | 研究支持 |
|------|------|------|---------|
| 不知道自己的行为模式 | 数据散落在各处，没有整合分析 | AI 帮我总结"我是什么样的人" | 自我觉察是CBT的核心要素[^1] |
| 策略不够个性化 | 所有人收到相同的提醒 | 基于我的模式定制策略 | 个性化干预效果优于通用方案[^9] |
| 缺乏持续反馈 | 只有打开 App 才能看进度 | 定期收到有洞察的报告 | 持续反馈提高治疗依从性[^5] |
| 情绪影响执行 | 不知道情绪如何影响行为 | 理解情绪-行为关联 | 情绪调节是ADHD干预核心[^4] |

### 2.2 使用场景

1. **每周报告推送**（✅ 首先实现）
   - **周一早上**收到上周行为总结 + 本周建议
   - 包含：完成率趋势、最常分心时段、本周亮点、个性化建议

2. **智能策略调整**
   - 检测到连续 3 天失败 → 自动建议降低难度
   - 检测到周末总是失败 → 建议周末用不同策略

3. **里程碑庆祝**
   - 连续 7 天完成 → 推送鼓励
   - 打破个人记录 → 推送庆祝

4. **预警提醒**
   - 检测到即将断连（已连续 N-1 天）→ 推送提醒
   - 检测到最近分心增多 → 推送关心

---

## 2.5 推送内容设计

### 每周报告结构

推送消息分为两部分：
1. **推送通知**（2-3 句话，吸引点击）
2. **详情页**（可选，App 内查看完整报告）

#### 推送通知示例

```
📊 上周你完成了 12 个任务，比前一周提高 20%！
发现：你在晚上 9-11 点效率最高。
本周建议：试试把重要任务安排在这个时段。
```

#### 报告内容模块

| 模块 | 内容 | 数据来源 | 研究依据 |
|------|------|---------|---------|
| **本周亮点** | 完成数、最长专注、连续天数 | tasks, focus_sessions | 正向反馈增强动机[^1] |
| **行为洞察** | 高效时段、分心模式、情绪规律 | call_records, focus_sessions | 自我觉察是改变基础[^4] |
| **跨数据关联** | 情绪-行为、睡眠-执行力关联 | 多表关联分析 | 整体观是有效干预关键[^9] |
| **用户画像** | "你是什么类型的人" | user_memories + AI 分析 | 个性化策略更有效[^2] |
| **循证建议** | 2-3 条基于研究的行动建议 | AI 生成 | 循证干预原则[^3] |
| **预警提醒** | 断连风险、下滑趋势 | goals, routine_completions | 早期干预效果最佳[^10] |

---

## 3. 跨表数据关联分析 🆕

### 3.1 关联分析框架

基于研究文献，ADHD的核心困难涉及多个维度，需要跨表关联才能获得完整洞察：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          用户行为数据关联图                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   [情绪/心理状态]          [行为表现]              [生理数据]                │
│        │                      │                       │                     │
│   user_memories ◄────────► call_records          health_data               │
│   (EMO标签)                (接听状态)             (睡眠数据)                │
│        │                      │                       │                     │
│        │                      ▼                       │                     │
│        └──────────────► tasks状态 ◄─────────────────┘                      │
│                        (完成/跳过)                                          │
│                             │                                               │
│                             ▼                                               │
│                       focus_sessions                                        │
│                      (专注/分心模式)                                        │
│                             │                                               │
│                             ▼                                               │
│                    goals/goal_entries                                       │
│                   (目标达成/连续性)                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 核心关联场景

#### 场景1：情绪 → 电话接听 → 任务完成

**关联假设**：用户不愿意接电话可能是因为心情不好，而这会导致任务完成率下降

```sql
-- 关联查询：情绪状态与电话接听、任务完成的关系
WITH emotion_context AS (
  -- 从记忆中提取情绪相关信息
  SELECT user_id, content, confidence, created_at::date as memory_date
  FROM user_memories
  WHERE tag = 'EMO'  -- 情绪触发标签
    AND compression_status = 'active'
),
call_behavior AS (
  -- 电话接听行为
  SELECT 
    user_id,
    ring_at::date as call_date,
    status,  -- answered, missed, declined
    ring_duration_seconds
  FROM call_records
),
task_outcome AS (
  -- 任务完成情况
  SELECT
    user_id,
    created_at::date as task_date,
    status,
    is_skip
  FROM tasks
)
SELECT 
  e.memory_date,
  e.content as emotion_context,
  COUNT(c.id) FILTER (WHERE c.status = 'declined') as declined_calls,
  COUNT(t.id) FILTER (WHERE t.status != 'completed' OR t.is_skip = true) as incomplete_tasks
FROM emotion_context e
LEFT JOIN call_behavior c ON e.user_id = c.user_id AND e.memory_date = c.call_date
LEFT JOIN task_outcome t ON e.user_id = t.user_id AND e.memory_date = t.task_date
GROUP BY e.memory_date, e.content;
```

#### 场景2：睡眠 → 执行功能 → 任务表现

**研究支持**：研究表明睡眠质量直接影响ADHD患者的执行功能表现[^3]

```sql
-- 关联查询：睡眠数据与第二天任务表现
WITH sleep_data AS (
  SELECT 
    user_id,
    (end_date::date) as sleep_date,
    SUM(CASE WHEN data_type = 'sleep' THEN value ELSE 0 END) as total_sleep_hours,
    AVG(CASE WHEN data_type = 'heart_rate' AND sleep_stage IS NOT NULL THEN value END) as avg_sleep_hr
  FROM health_data
  WHERE data_type IN ('sleep', 'heart_rate')
  GROUP BY user_id, end_date::date
),
next_day_performance AS (
  SELECT
    user_id,
    created_at::date as task_date,
    COUNT(*) as total_tasks,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
    AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completion_rate
  FROM tasks
  GROUP BY user_id, created_at::date
)
SELECT 
  s.sleep_date,
  s.total_sleep_hours,
  p.completion_rate,
  CASE 
    WHEN s.total_sleep_hours < 6 THEN '睡眠不足可能影响了执行力'
    WHEN s.total_sleep_hours >= 7 AND p.completion_rate > 0.8 THEN '充足睡眠帮助你保持高效'
    ELSE NULL
  END as insight
FROM sleep_data s
JOIN next_day_performance p ON s.user_id = p.user_id AND s.sleep_date = p.task_date - 1;
```

#### 场景3：记忆标签 → 行为模式 → 干预建议

**记忆标签系统与行为关联**：

| 记忆标签 | 含义 | 关联数据表 | 洞察类型 |
|---------|------|-----------|---------|
| **EMO** | 情绪触发 | call_records, tasks | "当你感到焦虑时，往往会回避电话" |
| **PROC** | 拖延原因 | tasks.is_skip, focus_sessions | "你通常因为'任务太大'而拖延" |
| **SOMA** | 身心反应 | health_data, focus_sessions | "睡眠不足时你的专注力下降40%" |
| **SAB** | 自我妨碍 | goals.consecutive_failure | "你在接近成功时容易自我破坏" |
| **PREF** | 交互偏好 | call_records, chat_sessions | "你更喜欢文字而非电话沟通" |
| **EFFECTIVE** | 有效策略 | tasks.overcame_resistance | "分解任务对你特别有效" |

### 3.3 关联分析SQL函数 🆕

```sql
-- 获取用户跨数据关联洞察
CREATE OR REPLACE FUNCTION public.get_cross_data_insights(
  p_user_id UUID,
  p_week_start DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_week_end DATE;
  v_result JSONB;
  v_emotion_call_correlation JSONB;
  v_sleep_performance_correlation JSONB;
  v_memory_behavior_patterns JSONB;
BEGIN
  v_week_end := p_week_start + INTERVAL '7 days';

  -- 1. 情绪-电话接听关联
  SELECT jsonb_build_object(
    'declined_calls_count', COUNT(*) FILTER (WHERE cr.status = 'declined'),
    'total_calls', COUNT(*),
    'decline_rate', CASE 
      WHEN COUNT(*) > 0 
      THEN ROUND(COUNT(*) FILTER (WHERE cr.status = 'declined')::NUMERIC / COUNT(*) * 100, 1)
      ELSE 0 
    END,
    'emotional_context', (
      SELECT jsonb_agg(DISTINCT content)
      FROM user_memories
      WHERE user_id = p_user_id
        AND tag = 'EMO'
        AND compression_status = 'active'
        AND created_at >= p_week_start
        AND created_at < v_week_end
    )
  ) INTO v_emotion_call_correlation
  FROM call_records cr
  WHERE cr.user_id = p_user_id
    AND cr.ring_at >= p_week_start
    AND cr.ring_at < v_week_end;

  -- 2. 睡眠-表现关联
  SELECT jsonb_build_object(
    'avg_sleep_hours', COALESCE(ROUND(AVG(h.value)::NUMERIC, 1), 0),
    'avg_completion_rate', COALESCE(ROUND(AVG(
      CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END
    )::NUMERIC * 100, 1), 0),
    'low_sleep_days', COUNT(DISTINCT h.end_date::date) FILTER (WHERE h.value < 6),
    'high_performance_after_good_sleep', (
      SELECT COUNT(*)
      FROM health_data h2
      JOIN tasks t2 ON t2.user_id = h2.user_id 
        AND t2.created_at::date = h2.end_date::date + 1
      WHERE h2.user_id = p_user_id
        AND h2.data_type = 'sleep'
        AND h2.value >= 7
        AND t2.status = 'completed'
        AND h2.end_date >= p_week_start
        AND h2.end_date < v_week_end
    )
  ) INTO v_sleep_performance_correlation
  FROM health_data h
  LEFT JOIN tasks t ON t.user_id = h.user_id AND t.created_at::date = h.end_date::date + 1
  WHERE h.user_id = p_user_id
    AND h.data_type = 'sleep'
    AND h.end_date >= p_week_start
    AND h.end_date < v_week_end;

  -- 3. 记忆-行为模式
  SELECT jsonb_build_object(
    'procrastination_patterns', (
      SELECT jsonb_agg(jsonb_build_object('reason', content, 'confidence', confidence))
      FROM user_memories
      WHERE user_id = p_user_id
        AND tag = 'PROC'
        AND compression_status = 'active'
      LIMIT 5
    ),
    'effective_strategies', (
      SELECT jsonb_agg(jsonb_build_object('strategy', content, 'confidence', confidence))
      FROM user_memories
      WHERE user_id = p_user_id
        AND tag = 'EFFECTIVE'
        AND compression_status = 'active'
      LIMIT 5
    ),
    'emotional_triggers', (
      SELECT jsonb_agg(jsonb_build_object('trigger', content, 'confidence', confidence))
      FROM user_memories
      WHERE user_id = p_user_id
        AND tag = 'EMO'
        AND compression_status = 'active'
      LIMIT 5
    ),
    'self_sabotage_patterns', (
      SELECT jsonb_agg(jsonb_build_object('pattern', content, 'confidence', confidence))
      FROM user_memories
      WHERE user_id = p_user_id
        AND tag = 'SAB'
        AND compression_status = 'active'
      LIMIT 5
    )
  ) INTO v_memory_behavior_patterns;

  -- 组装结果
  v_result := jsonb_build_object(
    'emotion_call_correlation', v_emotion_call_correlation,
    'sleep_performance_correlation', v_sleep_performance_correlation,
    'memory_behavior_patterns', v_memory_behavior_patterns
  );

  RETURN v_result;
END;
$$;
```

---

## 4. 技术架构

### 4.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                     Supabase Cron Job                        │
│              (每日/每周定时触发)                              │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              Edge Function: behavior-analyzer                 │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │ 数据聚合器   │ → │ Gemini 分析  │ → │ 策略生成 & 存储  │  │
│  │ (SQL Query) │    │ (Flash/Pro) │    │ (DB + 推送队列) │  │
│  │ + 跨表关联  │    │ + 循证框架  │    │                 │  │
│  └─────────────┘    └─────────────┘    └─────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              Edge Function: send-behavior-report              │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐                       │
│  │ 读取分析结果  │ → │ 生成推送内容  │ → VoIP/FCM Push       │
│  └──────────────┘    └──────────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 数据流（增强版）

```
1. 数据收集（已有）
   tasks → routine_completions → focus_sessions → call_records → health_data
                    │
                    ▼
2. 数据聚合（新建）
   → get_weekly_behavior_snapshot()（基础统计）
   → get_cross_data_insights()（跨表关联）🆕
                    │
                    ▼
3. AI 分析（新建，基于循证框架）
   → Gemini Pro/Flash 分析
   → 输入：行为数据 + 记忆 + 跨表关联
   → 输出：insights + recommendations（基于研究）
                    │
                    ▼
4. 策略执行（新建）
   → 自动调整 goals 参数
   → 推送报告给用户
```

### 4.3 推荐的 AI 模型选择

| 场景 | 推荐模型 | 原因 |
|------|---------|------|
| 每日快速分析 | Gemini 2.0 Flash | 快、便宜、足够用 |
| 每周深度报告 | Gemini 2.0 Pro | 更好的推理和洞察 |
| 实时对话建议 | Gemini Live (已有) | 已集成 |

---

## 5. 数据模型设计

### 5.1 利用现有表格（优先）

| 表格 | 分析用途 | 需要的字段 | 研究关联 |
|------|---------|-----------|---------|
| `tasks` | 任务完成模式 | status, completed_at, is_skip, time_category | 执行功能评估[^3] |
| `routine_completions` | 习惯连续性 | completion_date, task_name | 行为激活追踪[^7] |
| `user_memories` | 用户画像 + 情绪模式 | tag, content, confidence | 情绪调节[^4] |
| `goals` + `goal_entries` | 目标达成率 | consecutive_success/failure | 目标管理训练[^3] |
| `focus_sessions` | 专注/分心模式 | duration_seconds, distraction_count | 注意力训练[^8] |
| `call_records` | 电话交互行为 | status, ring_duration_seconds | 回避行为识别 |
| `health_data` | 睡眠/生理数据 | data_type, value, sleep_stage | 睡眠-执行力关联[^6] |
| `chat_sessions` | 对话内容分析 | messages, extracted_data | 认知模式识别[^1] |

### 5.2 记忆标签与干预策略映射 🆕

| 记忆标签 | 心理学含义 | 对应干预策略 | 研究依据 |
|---------|-----------|-------------|---------|
| **EMO** | 情绪触发因素 | 情绪觉察 + 正念技巧 | 正念干预研究[^4] |
| **PROC** | 拖延根本原因 | 行为激活 + 任务分解 | CBT核心技术[^1] |
| **SOMA** | 身心状态反应 | 生活方式调整 + 睡眠优化 | 运动干预研究[^6] |
| **SAB** | 自我妨碍模式 | 认知重构 + 成功经验强化 | CBT认知技术[^2] |
| **PREF** | 交互偏好 | 个性化沟通方式 | 个性化干预原则[^9] |
| **EFFECTIVE** | 已验证有效策略 | 策略强化 + 推广应用 | 循证实践原则[^10] |

### 5.3 新增表格（最小化）

```sql
-- 用户行为分析结果表（存储 AI 分析输出）
CREATE TABLE IF NOT EXISTS user_behavior_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),

  -- 分析周期
  period_type TEXT NOT NULL,  -- 'daily' | 'weekly' | 'monthly'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- AI 分析输出（JSON）
  user_profile JSONB,         -- 用户画像：类型、特点、优势、挑战
  insights JSONB,             -- 洞察：发现的模式、趋势
  cross_data_insights JSONB,  -- 🆕 跨表关联洞察
  recommendations JSONB,      -- 建议：策略调整、行动建议
  research_references JSONB,  -- 🆕 建议对应的研究依据

  -- 执行状态
  pushed_at TIMESTAMPTZ,      -- 推送时间
  push_type TEXT,             -- 'none' | 'notification' | 'email'

  -- 元数据
  model_used TEXT,            -- 使用的 AI 模型
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, period_type, period_start)
);
```

### 5.4 用户画像结构（基于研究的分类）

```json
{
  "persona_type": "情绪敏感型执行者",
  "adhd_profile": {
    "primary_challenge": "emotional_regulation",  // 基于研究的分类
    "secondary_challenge": "time_management"
  },
  "key_traits": [
    "情绪波动时容易回避任务",
    "晚上效率最高",
    "对 deadline 敏感"
  ],
  "strengths": [
    "一旦进入状态，专注力很强",
    "对运动类任务完成率高"
  ],
  "challenges": [
    "早起困难",
    "情绪低落时回避电话和任务"
  ],
  "cross_data_patterns": [
    {
      "pattern": "情绪状态影响电话接听",
      "evidence": "当记忆中有焦虑情绪时，电话拒接率提高60%",
      "data_sources": ["user_memories.EMO", "call_records"]
    },
    {
      "pattern": "睡眠影响执行功能",
      "evidence": "睡眠少于6小时时，任务完成率下降35%",
      "data_sources": ["health_data", "tasks"]
    }
  ],
  "effective_strategies": [
    "设置手机使用限制",
    "利用晚上时间做重要任务",
    "情绪低落时用文字代替电话沟通"
  ],
  "research_based_suggestions": [
    {
      "suggestion": "尝试5分钟正念呼吸练习",
      "rationale": "研究表明正念可改善ADHD的情绪调节",
      "reference": "PMC (2025) Mindfulness-based interventions for adults with ADHD"
    }
  ]
}
```

---

## 6. AI Prompt 设计（循证框架）🆕

### 6.1 行为分析 Prompt（增强版）

```
你是一位专业的行为心理学家和ADHD习惯教练，熟悉最新的ADHD干预研究。
请分析以下用户数据，基于循证研究生成用户画像和个性化建议。

## 循证框架参考

在生成建议时，请参考以下研究支持的干预策略：
1. **认知行为疗法 (CBT)**：改变负面思维模式，建立积极行为习惯
2. **执行功能训练**：改善工作记忆、抑制控制、认知灵活性
3. **正念干预**：提高情绪觉察和自我调节能力
4. **行为激活**：克服拖延和被动，增加积极行为
5. **睡眠-执行力关联**：优化睡眠以提高执行功能

## 用户数据

### 基础行为数据（过去 7 天）
${basicBehaviorData}

### 跨数据关联分析
${crossDataInsights}

### 记忆标签数据
- EMO（情绪触发）: ${emoMemories}
- PROC（拖延原因）: ${procMemories}
- SOMA（身心反应）: ${somaMemories}
- SAB（自我妨碍）: ${sabMemories}
- EFFECTIVE（有效策略）: ${effectiveMemories}
- PREF（交互偏好）: ${prefMemories}

### 电话接听数据
${callRecordsData}

### 健康数据（睡眠等）
${healthData}

## 输出要求

请输出 JSON 格式，包含：

1. **user_profile**: 用户画像
   - persona_type: 一个有趣的标签（如"情绪敏感型执行者"）
   - adhd_profile: { primary_challenge, secondary_challenge }
   - key_traits: 3-5 个关键特征
   - strengths: 2-3 个优势
   - challenges: 2-3 个挑战

2. **cross_data_insights**: 跨数据关联洞察（2-3 条）
   - 每条包含：pattern（模式）+ evidence（证据）+ data_sources（数据来源）
   - 特别关注：情绪↔行为、睡眠↔执行力、记忆↔当前表现 的关联

3. **insights**: 本周洞察（2-3 条）
   - 每条包含：observation（观察）+ implication（含义）

4. **recommendations**: 循证个性化建议（2-3 条）
   - 每条包含：
     - action（具体行动）
     - reason（原因，结合用户数据）
     - research_basis（研究依据，简述支持的研究）
     - priority（优先级 1-3）

5. **alert**: 是否需要特别关注
   - need_attention: 布尔值
   - reason: 原因
   - suggested_intervention: 建议的干预方式

用中文回复，语气温暖但直接，建议要具体可执行。
```

### 6.2 报告生成 Prompt

```
你是用户的习惯教练 Lumi。
请根据以下分析结果，生成一条温暖、有洞察的推送消息。

## 分析结果
${analysisResult}

## 要求
- 长度：2-3 句话
- 语气：像朋友一样关心，但有深度
- 包含：1 个具体观察（最好是跨数据关联洞察）+ 1 个鼓励或建议
- 如果发现情绪-行为关联，可以温和地提及
- 不要使用表情符号（除非用户偏好设置允许）

## 示例（基于跨数据关联）
"这周你在睡眠充足的日子任务完成率提高了40%，身体和大脑的连接真的很神奇。记得今晚早点休息，明天的你会感谢现在的决定。"

"注意到你这周有几次回避了电话提醒，可能跟情绪波动有关。没关系，我们可以试试文字提醒作为替代，找到适合你的方式最重要。"
```

### 6.3 干预策略映射表

```typescript
// 基于研究的干预策略映射
const INTERVENTION_STRATEGIES = {
  // 情绪相关
  emotional_dysregulation: {
    strategies: [
      {
        action: "尝试5分钟正念呼吸练习",
        research: "Mindfulness-based interventions meta-analysis (2025)",
        link: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12440486/"
      },
      {
        action: "识别情绪触发因素并记录",
        research: "CBT for ADHD effectiveness study (2023)",
        link: "https://pubmed.ncbi.nlm.nih.gov/36794797/"
      }
    ]
  },
  
  // 执行功能相关
  executive_function_deficit: {
    strategies: [
      {
        action: "将大任务分解为5分钟可完成的小步骤",
        research: "Executive Function Stimulation Methods review (2024)",
        link: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11278469/"
      },
      {
        action: "使用外部提示和工具辅助记忆",
        research: "Goal Management Training protocol",
        link: "https://www.sciencedirect.com/science/article/pii/S1551714423003270"
      }
    ]
  },
  
  // 睡眠相关
  sleep_performance_link: {
    strategies: [
      {
        action: "建立固定的睡眠时间，即使周末也保持一致",
        research: "Sleep and executive function in ADHD",
        link: "https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1376354/full"
      }
    ]
  },
  
  // 拖延相关
  procrastination: {
    strategies: [
      {
        action: "使用"2分钟规则"：如果能在2分钟内完成，立即做",
        research: "Behavioral Activation for ADHD-I (2025)",
        link: "https://www.frontiersin.org/journals/psychiatry/articles/10.3389/fpsyt.2025.1564506/full"
      },
      {
        action: "设置具体的开始时间而非截止时间",
        research: "CBT time management techniques",
        link: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12434339/"
      }
    ]
  },
  
  // 回避行为
  avoidance_behavior: {
    strategies: [
      {
        action: "接受回避是正常反应，但设定"先尝试2分钟"的规则",
        research: "Exposure and response prevention in CBT",
        link: "https://pubmed.ncbi.nlm.nih.gov/36794797/"
      }
    ]
  }
};
```

---

## 7. 实现路径

### Phase 1: 数据层（后端）

#### 1.1 创建数据库迁移
```bash
# 文件：supabase/migrations/20260203100000_create_behavior_insights.sql
# 已完成 ✅

# 新增：跨数据关联函数
# 文件：supabase/migrations/20260205100000_cross_data_insights.sql
```

#### 1.2 新增跨数据关联函数迁移

```sql
-- 文件：20260205100000_cross_data_insights.sql

-- 添加跨数据关联洞察字段
ALTER TABLE public.user_behavior_insights
  ADD COLUMN IF NOT EXISTS cross_data_insights JSONB,
  ADD COLUMN IF NOT EXISTS research_references JSONB;

-- 创建跨数据关联分析函数
-- (函数定义见 3.3 节)
```

### Phase 2: AI 分析引擎（后端）

#### 2.1 创建 Edge Function
```bash
# 文件：supabase/functions/weekly-behavior-analyzer/index.ts
# 已完成 ✅，需要更新以包含跨数据分析
```

**更新核心逻辑**：
1. 查询所有需要分析的用户
2. 调用 `get_weekly_behavior_snapshot()` 获取基础数据
3. 调用 `get_cross_data_insights()` 获取关联数据 🆕
4. 调用 Gemini 使用增强版 Prompt（包含循证框架）
5. 存储结果到 `user_behavior_insights`

#### 2.2 Cron 触发
```sql
-- 每周一凌晨 3 点运行分析
SELECT cron.schedule(
  'weekly-behavior-analysis',
  '0 3 * * 1',
  $$SELECT net.http_post(
    'https://xxx.supabase.co/functions/v1/weekly-behavior-analyzer',
    '{}',
    headers => '{"Authorization": "Bearer xxx"}'
  )$$
);
```

### Phase 3: 推送系统（后端）

#### 3.1 创建推送 Edge Function
```bash
# 文件：supabase/functions/send-weekly-report/index.ts
# 已完成 ✅
```

### Phase 4: 前端展示（可选）

- [ ] 报告详情页（打开推送后看完整报告）
- [ ] 历史报告列表
- [ ] 用户画像卡片
- [ ] 跨数据关联可视化 🆕

---

## 7.5 实现优先级

| 优先级 | 功能 | 工作量 | 研究依据 |
|-------|------|--------|---------|
| P0 | 数据聚合 SQL | 0.5 天 | - |
| P0 | 跨数据关联 SQL 🆕 | 0.5 天 | 多维度评估原则[^9] |
| P0 | AI 分析 Edge Function（循证增强）| 1 天 | CBT/MBI研究[^1][^4] |
| P0 | 推送集成 | 0.5 天 | - |
| P1 | Cron 调度 | 0.5 天 | - |
| P2 | 前端报告详情页 | 1-2 天 | - |
| P3 | 用户画像展示 | 1 天 | - |

**MVP 最小可用版本**：P0 + P1 = 3 天

---

## 8. 产品决策（全部已确认 ✅）

| 问题 | 决策 | 研究支持 |
|------|------|---------|
| 报告频率 | 每周一次 | 足够形成模式，不至于信息过载 |
| 推送时间 | 早上 8 点（用户本地时间）| 符合计划-执行的最佳时机 |
| 报告内容 | 总结 + 洞察建议 + 跨数据关联 | 整体观干预原则[^9] |
| 推送系统 | 复用现有 VoIP/FCM | - |
| AI 模型 | Gemini Flash | - |
| 冷启动阈值 | 至少 7 天数据 | 需要足够数据形成模式 |
| 推送开关 | 用户可关闭 | 尊重用户自主权 |
| MVP 范围 | 先做纯推送，详情页后续迭代 | - |
| 循证框架 | 所有建议基于研究 🆕 | 提高干预效果[^1-10] |

---

## 9. 实现进度

### ✅ 已完成

| 文件 | 说明 |
|------|------|
| `migrations/20260203120000_create_behavior_insights.sql` | 数据库表 + SQL 函数 |
| `functions/weekly-behavior-analyzer/index.ts` | AI 分析 Edge Function |
| `functions/send-weekly-report/index.ts` | 推送发送 Edge Function |

### 🔲 待完成

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 跨数据关联 SQL 函数 | `get_cross_data_insights()` | P0 |
| 更新 AI Prompt | 加入循证框架和跨数据分析 | P0 |
| 新增数据库字段 | cross_data_insights, research_references | P0 |
| Cron Job 配置 | 在 Supabase Dashboard 配置 | P1 |

---

## 10. 测试用例 🆕

### 10.1 跨数据关联测试场景

| 场景 | 输入数据 | 期望洞察 |
|------|---------|---------|
| 情绪→电话拒接 | EMO记忆含"焦虑"，同日call_records有declined | "当你感到焦虑时，更倾向于回避电话" |
| 睡眠→任务完成 | health_data睡眠<6h，次日tasks多为incomplete | "睡眠不足影响了你的任务执行力" |
| 有效策略应用 | EFFECTIVE记忆含"分解任务"，tasks有overcame_resistance=true | "分解任务对你真的有效，继续保持" |
| 自我妨碍识别 | SAB记忆含"快成功时放弃"，goals有高consecutive_failure | "注意到你在接近目标时容易退缩" |

### 10.2 循证建议测试

| 用户模式 | 期望建议 | 研究依据 |
|---------|---------|---------|
| 高情绪波动 | 正念呼吸练习 | [^4] |
| 频繁拖延 | 2分钟规则 + 任务分解 | [^1][^7] |
| 睡眠不足 | 固定睡眠时间 | [^6] |
| 电话回避 | 文字替代 + 接受回避 | [^2] |

---

## 附录A：现有数据表清单

```
✅ users              - 用户基本信息
✅ tasks              - 任务记录
✅ routine_completions- 习惯完成记录
✅ user_memories      - AI 提取的用户记忆（关键！包含EMO/PROC/SAB等标签）
✅ goals              - 目标设置
✅ goal_entries       - 目标每日记录
✅ focus_sessions     - 专注会话（替代sailing_sessions）
✅ call_records       - 电话记录（接听/拒接/未接）
✅ health_data        - 健康数据（睡眠等）
✅ chat_sessions      - AI 对话记录
```

---

## 附录B：参考文献完整列表

1. Liu et al. (2023). "Effectiveness of cognitive behavioural-based interventions for adults with ADHD extends beyond core symptoms: A meta-analysis" - Psychology and Psychotherapy

2. Corrales et al. (2023). "Long-term efficacy of a new 6-session CBT for adults with ADHD" - Psychiatry Research

3. Ramos-Galarza et al. (2024). "Systematic Review of Executive Function Stimulation Methods in the ADHD Population" - Journal of Clinical Medicine

4. PMC (2025). "Mindfulness-based interventions for adults with ADHD: A systematic review and meta-analysis"

5. Zhao et al. (2024). "A Digital Cognitive-Physical Intervention for ADHD: Randomized Controlled Trial" - JMIR

6. Yang et al. (2024). "Effect of aerobic exercise on executive function in children with ADHD" - Frontiers in Psychology

7. Strålin et al. (2025). "CBT for ADHD predominantly inattentive presentation: RCT of two psychological treatments" - Frontiers in Psychiatry

8. MDPI (2025). "Analysis of Digital Therapeutic Interventions on Attention and Working Memory in ADHD Children"

9. PMC (2024). "New frontiers in pharmacological treatment of ADHD"

10. Lakes et al. (2024). "Digital health intervention for children with ADHD to improve mental health intervention" - BMC Digital Health

11. Merrill et al. (2024). "Improving the efficacy and effectiveness of evidence-based psychosocial interventions for ADHD" - Translational Psychiatry

12. Peterson et al. (2024). "Treatments for ADHD in Children and Adolescents: A Systematic Review" - Pediatrics

13. Ostinelli et al. (2025). "Comparative efficacy and acceptability of interventions for ADHD in adults" - The Lancet Psychiatry

---

## 已创建的文件

| 文件 | 说明 |
|------|------|
| Lumi-supabase/supabase/migrations/20260203120000_create_behavior_insights.sql | 数据库迁移 |
| Lumi-supabase/supabase/functions/weekly-behavior-analyzer/index.ts | AI 分析引擎 |
| Lumi-supabase/supabase/functions/send-weekly-report/index.ts | 推送发送 |
| Lumi/docs/in-progress/20260203-behavior-analysis-agent.md | 设计文档（本文件）|

---

## 工作流程

```
周一 3:00 AM                     周一 8:00 AM（用户本地时间）
     │                                │
     ▼                                ▼
┌────────────────┐              ┌────────────────┐
│ Cron 触发       │              │ Cron 每小时检查 │
│ weekly-behavior │  ──存储──▶   │ send-weekly-   │  ──推送──▶ 用户手机
│ -analyzer       │              │ report         │
│ + 跨数据关联    │              └────────────────┘
│ + 循证分析      │
└────────────────┘
```

---

## 下一步

1. **应用数据库迁移**
   ```bash
   cd Lumi-supabase && npm run supabase:push:local
   ```

2. **创建跨数据关联迁移**
   ```bash
   # 创建新迁移文件
   touch supabase/migrations/20260205100000_cross_data_insights.sql
   ```

3. **测试 AI 分析（指定用户）**
   ```bash
   npm run supabase:functions
   
   curl -X POST http://localhost:54321/functions/v1/weekly-behavior-analyzer \
     -H "Authorization: Bearer YOUR_SERVICE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"user_id": "YOUR_USER_ID"}'
   ```

4. **验证跨数据关联**
   ```sql
   -- 测试关联函数
   SELECT get_cross_data_insights('USER_ID', '2026-01-27');
   ```
