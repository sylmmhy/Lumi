---
title: "Stats 页面重构 - 蓄水池设计"
created: 2026-01-18
updated: 2026-01-18 14:00
stage: "📐 设计"
due: 2026-01-25
issue: ""
---

# Stats 页面重构实现计划

## 阶段进度
- [x] 阶段 1：需求分析
- [x] 阶段 2：方案设计
- [ ] 阶段 3：核心实现
- [ ] 阶段 4：测试验证
- [ ] 阶段 5：文档更新

---

## 1. 背景与目标

### 1.1 设计哲学
| 原则 | 说明 |
|------|------|
| **去压力化** | 移除"连胜/断签"元素，只展示"累计" |
| **视觉对比** | 顶部圆形（总览） vs 底部卡片（明细） |
| **物理隐喻** | 顶部是"蓄水池/充能"，底部是"经验条" |

### 1.2 核心目标
1. 将顶部从"连胜天数"改为"蓄水池/充能球"效果
2. 底部卡片添加里程碑进度条
3. 实现打卡联动动效（下方操作 → 上方充能）
4. 取消连胜重置逻辑，改为累计统计

---

## 2. 数据结构分析

### 2.1 tasks 表关键字段
```sql
-- 来源: supabase/migrations/00000000000000_schema.sql:1924

CREATE TABLE "public"."tasks" (
    "id" uuid,
    "user_id" uuid NOT NULL,
    "title" text NOT NULL,
    "status" task_status DEFAULT 'pending',  -- 'pending' | 'in_progress' | 'completed'
    "completed_at" timestamp with time zone,  -- 完成时间
    "task_type" text,  -- 'todo' | 'routine' | 'routine_instance'
    -- ...其他字段
);

-- 已有索引（可直接利用）:
CREATE INDEX idx_tasks_user_completed ON tasks (user_id, status, completed_at DESC)
  WHERE status = 'completed';
```

### 2.2 蓄水池数据计算逻辑

```typescript
/**
 * 计算本周完成的任务数量
 * @param userId - 用户 ID
 * @returns { current: number, target: number }
 */
async function getWeeklyProgress(userId: string) {
  // 获取本周一 00:00:00
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=周日
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  // 查询本周完成的任务
  const { count } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('completed_at', monday.toISOString());

  return {
    current: count || 0,
    target: 20  // 目标值（可配置）
  };
}
```

---

## 3. 组件架构设计

### 3.1 新增组件

```
src/components/stats/
├── WaterTankProgress.tsx     # 🆕 蓄水池/充能球组件
├── MilestoneProgressBar.tsx  # 🆕 里程碑进度条
├── CheckInToast.tsx          # 🆕 打卡成功 Toast
├── StatsCard.tsx             # 修改：添加进度条+动画
├── types.ts                  # 修改：添加新类型
└── index.ts                  # 修改：导出新组件
```

### 3.2 组件层级关系

```
StatsView.tsx
├── WaterTankProgress        ← 顶部蓄水池
│   └── (SVG 波浪动画)
│
├── StatsCard[]              ← 习惯卡片列表
│   ├── 热力图
│   ├── MilestoneProgressBar ← 里程碑进度条
│   └── 打卡按钮 (带弹跳动画)
│
└── CheckInToast             ← 全局 Toast
```

---

## 4. 详细实现方案

### 4.1 WaterTankProgress 组件

**文件**: `src/components/stats/WaterTankProgress.tsx`

**Props 接口**:
```typescript
interface WaterTankProgressProps {
  /** 当前完成数 */
  current: number;
  /** 目标数 */
  target: number;
  /** 主文案 */
  slogan?: string;
  /** 触发水位上涨动画 */
  triggerRise?: boolean;
}
```

**视觉实现**:
- 圆形容器 (`w-32 h-32` 或响应式)
- SVG 波浪动画 (CSS keyframes)
- 水位高度 = `(current / target) * 100%`
- 中心文字: `{current}/{target}`

**CSS 波浪动画方案**:
```css
@keyframes wave {
  0% { transform: translateX(0) translateY(0); }
  50% { transform: translateX(-25%) translateY(2px); }
  100% { transform: translateX(-50%) translateY(0); }
}

.water-wave {
  animation: wave 3s ease-in-out infinite;
}
```

### 4.2 MilestoneProgressBar 组件

**文件**: `src/components/stats/MilestoneProgressBar.tsx`

**Props 接口**:
```typescript
interface MilestoneProgressBarProps {
  /** 累计完成次数（永不清零） */
  totalCount: number;
  /** 里程碑数组 */
  milestones?: number[];
}
```

**里程碑计算**:
```typescript
const defaultMilestones = [10, 30, 60, 100, 200, 500];

function getMilestoneProgress(totalCount: number, milestones = defaultMilestones) {
  // 找到当前所在的里程碑区间
  let prevMilestone = 0;
  let nextMilestone = milestones[0];

  for (let i = 0; i < milestones.length; i++) {
    if (totalCount < milestones[i]) {
      nextMilestone = milestones[i];
      prevMilestone = i > 0 ? milestones[i - 1] : 0;
      break;
    }
    // 超过最高里程碑
    if (i === milestones.length - 1) {
      prevMilestone = milestones[i];
      nextMilestone = milestones[i]; // 满格
    }
  }

  const progress = (totalCount - prevMilestone) / (nextMilestone - prevMilestone);
  return { progress: Math.min(progress, 1), nextMilestone };
}
```

### 4.3 StatsCard 修改

**文件**: `src/components/stats/StatsCard.tsx`

**新增功能**:
1. 底部添加 `MilestoneProgressBar`
2. 打卡按钮添加弹跳动画
3. 新增 `onCheckIn` 回调

**打卡按钮动画**:
```typescript
const [isAnimating, setIsAnimating] = useState(false);

const handleCheckIn = () => {
  setIsAnimating(true);
  onToggleToday();
  setTimeout(() => setIsAnimating(false), 300);
};

// className
className={`transform transition-transform ${isAnimating ? 'scale-125' : 'scale-100'}`}
```

### 4.4 联动动效实现

**数据流**:
```
用户点击打卡按钮
    │
    ▼
StatsCard.handleCheckIn()
    │
    ├─→ 按钮弹跳动画
    ├─→ 进度条 +1 (本地状态)
    │
    ▼
StatsView.onCheckIn(habitId)
    │
    ├─→ 更新数据库
    ├─→ setWaterLevel(prev => prev + 1)
    │
    ▼
WaterTankProgress
    │
    └─→ 水位上涨动画 (通过 useEffect 监听 current 变化)
```

**StatsView 状态管理**:
```typescript
// 本周完成数（蓄水池数据）
const [weeklyProgress, setWeeklyProgress] = useState({ current: 0, target: 20 });

// 打卡成功回调
const handleCheckIn = async (habitId: string) => {
  await toggleHabitToday(habitId);

  // 更新蓄水池（乐观更新）
  setWeeklyProgress(prev => ({
    ...prev,
    current: prev.current + 1
  }));

  // 显示 Toast
  showRandomToast();
};
```

### 4.5 Toast 激励系统

**文件**: `src/components/stats/CheckInToast.tsx`

**文案池**:
```typescript
const toastMessages = [
  "You showed up! That's a win.",
  "干得漂亮！",
  "又积攒了一次！",
  "Keep going! 🔥",
  "一步一步，稳稳前进",
  "Nice! 坚持就是胜利",
];
```

**实现方式**:
```typescript
const [toast, setToast] = useState<string | null>(null);

const showRandomToast = () => {
  const message = toastMessages[Math.floor(Math.random() * toastMessages.length)];
  setToast(message);
  setTimeout(() => setToast(null), 2000);
};
```

---

## 5. 数据层修改

### 5.1 新增 Service 函数

**文件**: `src/remindMe/services/statsService.ts` (新建)

```typescript
/**
 * 获取本周完成的任务数量
 */
export async function getWeeklyCompletedCount(userId: string): Promise<number>;

/**
 * 获取习惯的累计完成次数（用于里程碑进度条）
 */
export async function getHabitTotalCompletions(userId: string, habitId: string): Promise<number>;
```

### 5.2 类型扩展

**文件**: `src/components/stats/types.ts`

```typescript
// 新增
export interface WeeklyProgress {
  current: number;
  target: number;
  weekStart: string; // ISO date
}

// Habit 扩展
export interface Habit {
  // ...现有字段
  totalCompletions?: number;  // 累计完成次数
}
```

---

## 6. UI 视觉规范

### 6.1 蓄水池区域
```
┌─────────────────────────────────────┐
│                                     │
│      "You're building momentum!"    │
│                                     │
│           ╭─────────────╮           │
│           │   ~~~~~~~   │ ← 波浪    │
│           │    12/20    │ ← 数字    │
│           │   ███████   │ ← 水位    │
│           │   ███████   │           │
│           ╰─────────────╯           │
│                                     │
└─────────────────────────────────────┘
```

### 6.2 配色方案
| 元素 | 颜色 |
|------|------|
| 水位填充 | `#F5D76E` (金色) 或 `#4ECDC4` (青色) |
| 水位背景 | `#F0F0F0` (浅灰) |
| 波浪高光 | `rgba(255,255,255,0.3)` |
| 数字文字 | `#333` 或 白色（根据水位深度） |

### 6.3 里程碑进度条
```
[██████████░░░░░░░░░░] 25/30
     ↑ 已完成         ↑ 下一里程碑
```

---

## 7. 实现顺序

| 步骤 | 任务 | 文件 | 依赖 |
|------|------|------|------|
| 1 | 创建 `statsService.ts` | `src/remindMe/services/` | 无 |
| 2 | 创建 `WaterTankProgress.tsx` | `src/components/stats/` | 无 |
| 3 | 创建 `MilestoneProgressBar.tsx` | `src/components/stats/` | 无 |
| 4 | 创建 `CheckInToast.tsx` | `src/components/stats/` | 无 |
| 5 | 修改 `StatsCard.tsx` | `src/components/stats/` | Step 3 |
| 6 | 修改 `StatsView.tsx` | `src/components/app-tabs/` | Step 1-5 |
| 7 | 删除/修改 `StatsHeader.tsx` | `src/components/app-tabs/` | Step 2 |
| 8 | 更新 `stats/index.ts` 导出 | `src/components/stats/` | Step 2-4 |

---

## 8. 待确认事项

在开始实现前，需要确认：

| # | 问题 | 默认值 | 状态 |
|---|------|--------|------|
| 1 | "本周"定义：周一~周日 还是 过去7天滚动？ | 周一~周日 
| 2 | 目标值 (target) 是固定 20 还是可配置？ | 固定 20 
| 3 | 里程碑数值具体是 `[10, 30, 60, 100...]`？ | 是 | 
| 4 | 是否需要 Figma 设计稿？ | - | 先做 |
| 5 | 水位颜色偏好：金色/青色/其他？ | 金色 

---

## 9. 关键文件清单

| 文件 | 作用 | 操作 |
|------|------|------|
| `src/components/stats/WaterTankProgress.tsx` | 蓄水池组件 | 🆕 新建 |
| `src/components/stats/MilestoneProgressBar.tsx` | 里程碑进度条 | 🆕 新建 |
| `src/components/stats/CheckInToast.tsx` | Toast 组件 | 🆕 新建 |
| `src/remindMe/services/statsService.ts` | 统计数据服务 | 🆕 新建 |
| `src/components/stats/StatsCard.tsx` | 习惯卡片 | ✏️ 修改 |
| `src/components/stats/types.ts` | 类型定义 | ✏️ 修改 |
| `src/components/stats/index.ts` | 模块导出 | ✏️ 修改 |
| `src/components/app-tabs/StatsView.tsx` | 主容器 | ✏️ 修改 |
| `src/components/app-tabs/StatsHeader.tsx` | 旧头部组件 | 🗑️ 删除或重写 |

---

## 10. 实现记录

### 2026-01-18
- 完成需求分析和方案设计
- 确认 tasks 表结构：`status='completed'` + `completed_at` 字段
- 已有索引 `idx_tasks_user_completed` 可直接利用
- 创建本计划文档

---

## 11. 相关 Commit
（实现后补充）
