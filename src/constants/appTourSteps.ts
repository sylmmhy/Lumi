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
  /** 步骤编号 (1-5) */
  step: number;
  /** 当前步骤所在路由 */
  route: string;
  /** 目标元素的 CSS 选择器（单个高亮区域） */
  targetSelector: string;
  /** 多个高亮区域的 CSS 选择器（可选，优先于 targetSelector） */
  targetSelectors?: string[];
  /** 步骤标题的翻译 key */
  titleKey: string;
  /** 步骤内容的翻译 key */
  contentKey: string;
  /** Tooltip 相对于目标元素的位置 */
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** 下一步要跳转的路由（null 表示同页面） */
  nextRoute: string | null;
  /** 是否最后一步 */
  isLast?: boolean;
}

/**
 * 5 步引导配置
 *
 * 流程：
 * 1. 高亮任务输入区域（输入框 + 快捷标签）(/app/home)
 * 2. 高亮第一个习惯卡片 (/app/home)
 * 3. 高亮添加习惯按钮 (/app/home)
 * 4. 高亮统计内容区 (/app/stats)
 * 5. 高亮 Start 按钮 (/app/urgency)
 */
export const APP_TOUR_STEPS: TourStep[] = [
  {
    step: 1,
    route: '/app/home',
    targetSelector: '[data-tour="task-input-area"]',
    titleKey: 'tour.step1.title',
    contentKey: 'tour.step1.content',
    position: 'bottom',
    nextRoute: null, // 同页面
  },
  {
    step: 2,
    route: '/app/home',
    targetSelector: '[data-tour="add-habit-button"]',
    titleKey: 'tour.step2.title',
    contentKey: 'tour.step2.content',
    position: 'bottom',
    nextRoute: null, // 同页面
  },
  {
    step: 3,
    route: '/app/home',
    targetSelector: '[data-tour="first-habit"]',
    titleKey: 'tour.step3.title',
    contentKey: 'tour.step3.content',
    position: 'bottom',
    nextRoute: '/app/stats?tour=4',
  },
  {
    step: 4,
    route: '/app/stats',
    targetSelector: '[data-tour="habit-record-example"]',
    titleKey: 'tour.step4.title',
    contentKey: 'tour.step4.content',
    position: 'bottom',
    nextRoute: '/app/urgency?tour=5',
  },
  {
    step: 5,
    route: '/app/urgency',
    targetSelector: '[data-tour="urgency-input-area"]',
    titleKey: 'tour.step5.title',
    contentKey: 'tour.step5.content',
    position: 'bottom',
    nextRoute: null,
    isLast: true,
  },
];

/**
 * 总步骤数
 */
export const TOUR_TOTAL_STEPS = APP_TOUR_STEPS.length;
