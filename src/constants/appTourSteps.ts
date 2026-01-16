/**
 * Product Tour 步骤配置
 * 用于新用户引导，在 Habit Onboarding 完成后教用户认识核心界面
 */

/**
 * Tour 步骤上下文，用于动态内容渲染
 */
export interface TourContext {
  /** 用户设置的提醒时间，如 "08:00" */
  reminderTime?: string;
  /** 用户设置的习惯名称 */
  habitName?: string;
}

/**
 * 单个 Tour 步骤的配置
 */
export interface TourStep {
  /** 步骤编号 (1-4) */
  step: number;
  /** 当前步骤所在路由 */
  route: string;
  /** 目标元素的 CSS 选择器 */
  targetSelector: string;
  /** 步骤标题 */
  title: string;
  /** 步骤内容（支持字符串或动态函数） */
  content: string | ((ctx: TourContext) => string);
  /** Tooltip 相对于目标元素的位置 */
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** 下一步要跳转的路由（null 表示同页面） */
  nextRoute: string | null;
  /** 是否最后一步 */
  isLast?: boolean;
}

/**
 * 4 步引导配置
 *
 * 流程：
 * 1. 高亮第一个习惯卡片 (/app/home)
 * 2. 高亮添加习惯按钮 (/app/home)
 * 3. 高亮统计内容区 (/app/stats)
 * 4. 高亮 Start 按钮 (/app/urgency)
 */
export const APP_TOUR_STEPS: TourStep[] = [
  {
    step: 1,
    route: '/app/home',
    targetSelector: '[data-tour="first-habit"]',
    title: '你的第一个习惯',
    content: (ctx) =>
      `这个习惯会每天 ${ctx.reminderTime || '设定时间'} 提醒你。如果不想要，可以点击修改或删除。`,
    position: 'bottom',
    nextRoute: null, // 同页面
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

/**
 * localStorage key，用于标记 Tour 已完成
 */
export const TOUR_COMPLETED_KEY = 'product_tour_completed';

/**
 * 总步骤数
 */
export const TOUR_TOTAL_STEPS = APP_TOUR_STEPS.length;
