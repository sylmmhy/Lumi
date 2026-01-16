---
title: "Product Tour 新用户引导"
created: 2026-01-15
updated: 2026-01-15 16:30
stage: "🔨 实现中"
due: 2026-01-20
issue: ""
---

# Product Tour 新用户引导 实现进度

## 阶段进度
- [x] 阶段 1：需求分析
- [x] 阶段 2：方案设计
- [x] 阶段 3：核心实现
- [ ] 阶段 4：测试验证
- [ ] 阶段 5：文档更新

---

## 1. 背景与目标

### 背景
用户完成 Habit Onboarding（9 步流程）后，直接进入主 App 界面。新用户可能不知道：
- 刚设置的习惯在哪里、如何修改
- 如何添加更多习惯
- 打卡记录在哪里查看
- 如何立即开始专注

### 目标
在 Onboarding 流程结束后，通过"蒙层高亮引导"（Product Tour）教用户认识核心界面，共 4 步。

---

## 2. 方案设计

### 2.1 技术方案选择

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| 第三方库 (react-joyride) | 成熟稳定 | 依赖重、样式难定制 | ❌ 不采用 |
| **自己实现轻量级 Tour** | 完全控制、无依赖 | 需要开发 | ✅ 采用 |

### 2.2 Tour 流程设计

```
HabitOnboardingPage (Step 9 完成)
    ↓
跳转到 /app/home?tour=1
    ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 1: 高亮「刚设置的习惯卡片」(/app/home)                  │
│  "这个习惯会每天 XX:XX 提醒你，不想要可以点击修改或删除"       │
└─────────────────────────────────────────────────────────────┘
    ↓ 点击"下一步"
┌─────────────────────────────────────────────────────────────┐
│  Step 2: 高亮「添加习惯按钮」(/app/home)                     │
│  "你可以在这里添加更多的习惯"                                │
└─────────────────────────────────────────────────────────────┘
    ↓ 点击"下一步" → 自动跳转到 /app/stats?tour=3
┌─────────────────────────────────────────────────────────────┐
│  Step 3: 高亮「Stats 内容区」(/app/stats)                    │
│  "你的习惯打卡记录会显示在这里"                              │
└─────────────────────────────────────────────────────────────┘
    ↓ 点击"下一步" → 自动跳转到 /app/urgency?tour=4
┌─────────────────────────────────────────────────────────────┐
│  Step 4: 高亮「Start 按钮」(/app/urgency)                    │
│  "如果你想立刻开始，可以点击这里启动！"                       │
└─────────────────────────────────────────────────────────────┘
    ↓ 点击"知道了！"
Tour 结束 → 标记 localStorage → 下次不再显示
```

### 2.3 UI 交互设计

**蒙层效果**：
- 全屏半透明黑色背景 (`rgba(0,0,0,0.7)`)
- 目标元素区域"挖洞"透明，使用 `box-shadow` 实现
- Tooltip 气泡指向目标元素

**按钮**：
- 右上角"跳过"按钮（允许用户跳过整个 Tour）
- 底部"下一步"按钮（最后一步显示"知道了！"）
- 步骤指示器（1/4, 2/4...）

**动态内容**：
- Step 1 显示用户设置的具体提醒时间（如"每天 08:00"）

### 2.4 跨页面状态管理

使用 URL 参数传递 Tour 状态：
- `/app/home?tour=1` → Step 1
- `/app/home?tour=2` → Step 2
- `/app/stats?tour=3` → Step 3
- `/app/urgency?tour=4` → Step 4

**原因**：刷新页面不丢失进度，实现简单。

### 2.5 多语言策略

- 第一阶段：硬编码中文
- 第二阶段：抽取到 `src/locales/*.json`，复用现有 i18n 结构

---

## 3. 实现记录

### 2026-01-15
- 完成需求分析和方案设计
- 确认 4 步引导流程
- 确认 UI 交互细节（可跳过、显示具体时间）

### 2026-01-15 (下午)
**核心实现完成**：
- ✅ 创建 `src/constants/appTourSteps.ts` - 4 步引导配置
- ✅ 创建 `src/hooks/useProductTour.ts` - Tour 状态管理 Hook
- ✅ 创建 `src/components/tour/TourOverlay.tsx` - 蒙层 + 高亮 + Tooltip UI
- ✅ 修改 `HomeView.tsx` - 添加 `data-tour="first-habit"` 和 `data-tour="add-habit-button"`
- ✅ 修改 `StatsView.tsx` - 添加 `data-tour="stats-content"`
- ✅ 修改 `BottomNavBar.tsx` - 添加 `data-tour="start-button"`
- ✅ 修改 `AppTabsPage.tsx` - 集成 TourOverlay 组件
- ✅ 修改 `useHabitOnboarding.ts` - Onboarding 完成后跳转带 `?tour=1` 参数
- ✅ TypeScript 编译检查通过

**下一步**：测试验证

---

## 4. 关键文件

### 新建的文件

| 文件 | 作用 |
|------|-----|
| `src/constants/appTourSteps.ts` | 4 步引导的配置数据 |
| `src/hooks/useProductTour.ts` | Tour 状态管理 Hook |
| `src/components/tour/TourOverlay.tsx` | 蒙层 + 高亮 + Tooltip 的 UI 组件 |

### 修改的文件

| 文件 | 修改内容 |
|------|----------|
| `src/hooks/useHabitOnboarding.ts` | 完成后跳转到 `/app/home?tour=1` |
| `src/pages/AppTabsPage.tsx` | 集成 useProductTour 和 TourOverlay |
| `src/components/app-tabs/HomeView.tsx` | 给习惯卡片和添加按钮添加 `data-tour` 属性 |
| `src/components/app-tabs/StatsView.tsx` | 给内容区添加 `data-tour` 属性 |
| `src/components/app-tabs/BottomNavBar.tsx` | 给 Start 按钮添加 `data-tour` 属性 |

---

## 5. 待办事项

### 阶段 3：核心实现 ✅
- [x] 创建 `src/constants/appTourSteps.ts` - 步骤配置
- [x] 创建 `src/hooks/useProductTour.ts` - 状态管理 Hook
- [x] 创建 `src/components/tour/TourOverlay.tsx` - UI 组件
- [x] 修改 `HomeView.tsx` - 添加 `data-tour` 属性
- [x] 修改 `StatsView.tsx` - 添加 `data-tour` 属性
- [x] 修改 `BottomNavBar.tsx` - 添加 `data-tour` 属性
- [x] 修改 `AppTabsPage.tsx` - 集成 TourOverlay
- [x] 修改 `useHabitOnboarding.ts` - 跳转带 `?tour=1` 参数

### 阶段 4：测试验证
- [ ] 测试完整 4 步流程
- [ ] 测试跳过功能
- [ ] 测试刷新页面后恢复进度
- [ ] 测试 Tour 完成后不再显示
- [ ] iOS WebView 测试
- [ ] Android WebView 测试

### 阶段 5：多语言 & 文档
- [ ] 抽取文案到 `src/locales/*.json`
- [ ] 更新 CLAUDE.md 组件库说明（如需要）

---

## 6. 数据结构设计

### appTourSteps.ts

```typescript
export interface TourStep {
  step: number;
  route: string;                    // 当前步骤所在路由
  targetSelector: string;           // 目标元素的 CSS 选择器
  title: string;                    // 标题
  content: string | ((ctx: TourContext) => string);  // 内容（支持动态）
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  nextRoute: string | null;         // 下一步要跳转的路由（null 表示同页面）
  isLast?: boolean;                 // 是否最后一步
}

export interface TourContext {
  reminderTime?: string;            // 用户设置的提醒时间，如 "08:00"
  habitName?: string;               // 用户设置的习惯名称
}

export const APP_TOUR_STEPS: TourStep[] = [
  {
    step: 1,
    route: '/app/home',
    targetSelector: '[data-tour="first-habit"]',
    title: '你的第一个习惯',
    content: (ctx) => `这个习惯会每天 ${ctx.reminderTime || '设定时间'} 提醒你。如果不想要，可以点击修改或删除。`,
    position: 'bottom',
    nextRoute: null,
  },
  {
    step: 2,
    route: '/app/home',
    targetSelector: '[data-tour="add-habit-button"]',
    title: '添加更多习惯',
    content: '你可以在这里添加更多的习惯。',
    position: 'bottom',
    nextRoute: '/app/stats?tour=3',
  },
  {
    step: 3,
    route: '/app/stats',
    targetSelector: '[data-tour="stats-content"]',
    title: '打卡记录',
    content: '你的习惯打卡记录会显示在这里。',
    position: 'center',
    nextRoute: '/app/urgency?tour=4',
  },
  {
    step: 4,
    route: '/app/urgency',
    targetSelector: '[data-tour="start-button"]',
    title: '立刻开始',
    content: '如果你想立刻开始，可以点击这里启动！',
    position: 'top',
    nextRoute: null,
    isLast: true,
  },
];
```

### useProductTour.ts

```typescript
export interface UseProductTourReturn {
  // 状态
  isActive: boolean;              // Tour 是否激活
  currentStep: TourStep | null;   // 当前步骤配置
  stepNumber: number;             // 当前步骤号 (1-4)
  totalSteps: number;             // 总步骤数

  // 操作
  startTour: () => void;          // 开始 Tour
  nextStep: () => void;           // 下一步
  skipTour: () => void;           // 跳过
  completeTour: () => void;       // 完成

  // 上下文
  context: TourContext;           // 动态内容所需的上下文
}
```

---

## 7. 相关 commit
（实现完成后补充）
