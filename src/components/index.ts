/**
 * 组件统一导出
 * 
 * 使用方式：
 * import { TaskWorkingView, CelebrationView, CoinCounter } from '../components';
 */

// 任务执行视图
export { TaskWorkingView } from './task/TaskWorkingView';
export type { TaskWorkingViewProps } from './task/TaskWorkingView';

// 庆祝/结果视图
export { CelebrationView } from './celebration/CelebrationView';
export type { 
  CelebrationViewProps, 
  CelebrationFlow, 
  SuccessScene 
} from './celebration/CelebrationView';

// 动画效果组件
export { 
  ConfettiEffect,
  CoinCounter, 
  StaticCoinDisplay,
  LevelProgressBar, 
  SimpleProgressBar 
} from './effects';
export type { 
  ConfettiEffectProps,
  CoinCounterProps, 
  StaticCoinDisplayProps,
  LevelProgressBarProps, 
  SimpleProgressBarProps 
} from './effects';

// 底部导航栏
export { BottomNavBar } from './ui/BottomNavBar';

// 模态框
export { AssistantLoadingModal } from './modals/AssistantLoadingModal';

// 任务流程控制器
export { TaskFlowController } from './task-flow/TaskFlowController';
export type { TaskFlowControllerProps } from './task-flow/TaskFlowController';

// 承诺确认组件（Screen Time 解锁）
export { ConsequencePledgeConfirm } from './ConsequencePledgeConfirm';
export type { ConsequencePledgeConfirmProps } from './ConsequencePledgeConfirm';
