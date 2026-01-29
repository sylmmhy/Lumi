/**
 * ChoiceButtons 组件
 *
 * Urge Surfing 完成后的选择按钮
 *
 * 两个选项：
 * 1. 返回 Lumi（成功冲浪）
 * 2. 继续使用应用（突破，开始冷却期）
 *
 * @example
 * ```tsx
 * <ChoiceButtons
 *   appName="Instagram"
 *   cooldownMinutes={15}
 *   onReturnToLumi={() => navigate('/')}
 *   onContinueToApp={() => openApp('com.instagram.instagram')}
 *   isLoading={false}
 * />
 * ```
 */

import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

// =====================================================
// 类型定义
// =====================================================

export interface ChoiceButtonsProps {
  /** 被阻止应用的名称 */
  appName?: string;
  /** 冷却时间（分钟） */
  cooldownMinutes?: number;
  /** 返回 Lumi 回调 */
  onReturnToLumi: () => void;
  /** 继续使用应用回调 */
  onContinueToApp: () => void;
  /** 是否正在加载 */
  isLoading?: boolean;
  /** 是否禁用按钮 */
  disabled?: boolean;
}

// =====================================================
// 组件实现
// =====================================================

export const ChoiceButtons: React.FC<ChoiceButtonsProps> = ({
  appName = 'app',
  cooldownMinutes = 15,
  onReturnToLumi,
  onContinueToApp,
  isLoading = false,
  disabled = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-sm space-y-4 px-4">
      {/* 成功冲浪 - 返回 Lumi */}
      <button
        onClick={onReturnToLumi}
        disabled={disabled || isLoading}
        className="w-full py-4 px-6 bg-white text-brand-blue rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
      >
        <i className="fa-solid fa-house text-xl"></i>
        <span>{t('urge.returnToLumi')}</span>
      </button>

      {/* 突破 - 继续使用应用 */}
      <button
        onClick={onContinueToApp}
        disabled={disabled || isLoading}
        className="w-full py-4 px-6 bg-white/20 backdrop-blur-sm text-white border border-white/30 rounded-2xl font-medium text-base hover:bg-white/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center gap-1"
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-spinner fa-spin"></i>
            <span>{t('common.processing')}</span>
          </div>
        ) : (
          <>
            <span>{t('urge.continueToApp', { appName })}</span>
            <span className="text-xs text-white/60">
              {t('urge.cooldownHint', { minutes: cooldownMinutes })}
            </span>
          </>
        )}
      </button>

      {/* 说明文字 */}
      <p className="text-center text-white/50 text-xs mt-4">
        {t('urge.choiceHint')}
      </p>
    </div>
  );
};
