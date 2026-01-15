# Habit Onboarding 实现计划 (v2 - 复用现有 Task 系统)

## 核心原则

- ✅ 完全替代现有 onboarding 流程
- ✅ **复用现有 `tasks` 表** - 不创建新表
- ✅ 习惯 = `routine` 类型任务 (`type='routine'`, `isRecurring=true`, `recurrencePattern='daily'`)
- ✅ 复用 `reminderService.createReminder()` 创建习惯
- ✅ 不可跳过 - 唯一可选: Step 5 的 Gemini Live 通话

---

## 6 步流程

| 步骤 | 标题         | 文案                                                     |
|------|--------------|----------------------------------------------------------|
| 1    | Welcome      | Hi, I'm Lumi 👋 Let's build your first habit today.      |
| 2    | Choose Habit | What habit do you want to start?                         |
| 3    | Set Time     | When should I remind you?                                |
| 4    | How It Works | At your chosen time, I'll call you with a short video reminder. |
| 5    | Try Now      | Ready to try? [Call Me Now] / [Skip for now]             |
| 6    | Done         | 🎉 All set!                                              |

---

## 数据映射

用户选择的习惯将映射到现有 `tasks` 表：

```typescript
// 用户在 onboarding 中选择:
// - habit: "Go to bed on time"
// - time: "22:00"

// 创建的 task 记录:
{
  text: "Go to bed on time",        // title
  time: "22:00",                    // HH:mm 24h
  displayTime: "10:00 PM",          // 12h display
  type: "routine",                  // 使用 routine 类型
  isRecurring: true,                // 标记为重复
  recurrencePattern: "daily",       // 每天重复
  date: "2026-01-05",              // reminder_date = 今天
  completed: false,
  called: false,
  timezone: "Asia/Shanghai"         // 用户时区
}
```

---

## 复用的现有代码

| 模块 | 文件 | 用途 |
|------|------|------|
| Task 服务 | `src/remindMe/services/reminderService.ts` | `createReminder()` 创建 routine |
| Task 类型 | `src/remindMe/types.ts` | `Task`, `RecurrencePattern` 类型 |
| Gemini Live | `src/hooks/gemini-live/useGeminiLive.ts` | AI 通话 |
| 计时器 | `src/hooks/useTaskTimer.ts` | 5分钟倒计时 |
| 波形动画 | `src/hooks/useWaveformAnimation.ts` | 语音动画 |
| Token 获取 | `src/hooks/gemini-live/useGeminiLive.ts` | `fetchGeminiToken()` |

---

## 新建文件

```
src/
├── pages/
│   └── onboarding/
│       └── HabitOnboardingPage.tsx      # 主页面 (替代现有入口)
│       └── habit-steps/
│           ├── WelcomeStep.tsx
│           ├── HabitSelectStep.tsx
│           ├── TimeSelectStep.tsx
│           ├── HowItWorksStep.tsx
│           ├── TryNowStep.tsx
│           ├── DoneStep.tsx
│           └── TrialCallView.tsx        # Gemini 通话视图
├── components/
│   └── onboarding/
│       ├── OnboardingLayout.tsx         # 布局 (进度条+返回)
│       ├── HabitButton.tsx
│       ├── TimePicker.tsx
│       └── CustomHabitModal.tsx
├── hooks/
│   └── useHabitOnboarding.ts            # 状态管理 (不含数据库逻辑)
└── types/
    └── habit.ts                         # 预设习惯常量
```

---

## 修改的现有文件

| 文件 | 修改内容 |
|------|----------|
| `src/App.tsx` | 更新路由，新用户进入 `/onboarding` |
| `src/pages/OnboardingPage.tsx` | 改为渲染 `HabitOnboardingPage` |

---

## useHabitOnboarding Hook 设计

```typescript
interface HabitOnboardingState {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  selectedHabitId: string | null;      // 'bedtime' | 'wakeup' | ... | 'custom'
  customHabitName: string;
  reminderTime: string;                // HH:mm
  trialCallCompleted: boolean;
  isSaving: boolean;
  error: string | null;
}

interface UseHabitOnboardingReturn {
  state: HabitOnboardingState;

  // 导航
  goToStep: (step: number) => void;
  goNext: () => void;
  goBack: () => void;

  // 数据设置
  selectHabit: (habitId: string) => void;
  setCustomHabitName: (name: string) => void;
  setReminderTime: (time: string) => void;

  // 完成
  completeTrialCall: () => void;
  saveAndFinish: () => Promise<void>;  // 调用 reminderService.createReminder()

  // 计算属性
  canProceed: boolean;
  habitDisplayName: string;
}
```

---

## 保存逻辑 (Step 6 - saveAndFinish)

```typescript
async function saveAndFinish() {
  const { user } = useAuth();

  const habitName = selectedHabitId === 'custom'
    ? customHabitName
    : PRESET_HABITS[selectedHabitId].name;

  // 使用现有 reminderService 创建 routine
  await reminderService.createReminder({
    text: habitName,
    time: reminderTime,                // "22:00"
    displayTime: formatTo12Hour(reminderTime),  // "10:00 PM"
    date: getTodayDate(),              // "2026-01-05"
    type: 'routine',
    isRecurring: true,
    recurrencePattern: 'daily',
    completed: false,
    called: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  }, user.id);

  // 导航到主 App
  navigate('/app/urgency');
}
```

---

## 预设习惯常量 (habit.ts)

```typescript
export const PRESET_HABITS = {
  bedtime:  { id: 'bedtime',  emoji: '🛏️', name: 'Go to bed on time' },
  wakeup:   { id: 'wakeup',   emoji: '🌅', name: 'Wake up early' },
  exercise: { id: 'exercise', emoji: '🏋️', name: 'Exercise' },
  study:    { id: 'study',    emoji: '📚', name: 'Study' },
  eat:      { id: 'eat',      emoji: '🍽️', name: 'Eat on schedule' },
  custom:   { id: 'custom',   emoji: '➕', name: 'Other' },
} as const;
```

---

## UI 设计

### 布局
```
┌────────────────────────────┐
│  ← [████░░░░░░]            │  返回 + 进度条 (Step 1 无返回)
│                            │
│        [主要内容]           │
│                            │
│       [操作按钮]            │
└────────────────────────────┘
```

### 主题色
- 背景: #FFFFFF
- 主按钮: #2563EB (蓝色)
- 选中: 蓝底白字
- 未选: #F3F4F6 灰底黑字
- 文字: #1A1A1A (标题), #666666 (副文字)

---

## 实现顺序

1. 创建 `habit.ts` 预设常量
2. 创建 `useHabitOnboarding.ts` hook
3. 创建 `OnboardingLayout.tsx` 布局组件
4. 创建 `HabitButton.tsx`, `TimePicker.tsx`, `CustomHabitModal.tsx`
5. 创建 6 个步骤组件
6. 创建 `TrialCallView.tsx` (Gemini 通话)
7. 创建 `HabitOnboardingPage.tsx` 主页面
8. 修改 `OnboardingPage.tsx` 渲染新组件
9. 测试完整流程

---

## 关键区别 vs 之前的计划

| 之前 | 现在 |
|------|------|
| 新建 `user_habits` 表 | 复用 `tasks` 表 |
| 自定义保存逻辑 | 使用 `reminderService.createReminder()` |
| 独立的习惯类型 | 使用 `type='routine'` + `isRecurring=true` |

---

## 确认项

1. ✅ 复用 `tasks` 表，type='routine'
2. ✅ 复用 `reminderService.createReminder()`
3. ✅ 习惯每天重复 (`recurrencePattern='daily'`)
4. ✅ 6 步流程，仅 Step 5 可跳过
5. ✅ 浅色主题 + 蓝色按钮
