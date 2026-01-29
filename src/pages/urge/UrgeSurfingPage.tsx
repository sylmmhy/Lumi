/**
 * UrgeSurfingPage - 冲动冲浪页面
 *
 * 当用户试图打开被阻止的应用时，通过 iOS Shortcuts 自动化触发此页面
 *
 * URL 格式：/urge-surfing?app=Instagram
 * - app 参数：应用名称（由 Shortcuts 的"当前 App"变量提供）
 *
 * 流程：
 * 1. 显示 4-7-8 呼吸动画（2个循环，共38秒）
 * 2. 显示选择按钮（返回 Lumi / 继续使用应用）
 * 3. 记录事件到数据库
 *
 * 循环防止机制（剪贴板方式）：
 * - 当用户选择"继续使用应用"时，Lumi 设置剪贴板标记 "LUMI_BYPASS_{appName}"
 * - Shortcuts 自动化检查剪贴板，如果有标记则跳过打开 Lumi
 */

import React, { useState, useEffect, useCallback, useContext } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { BreathingAnimation, ChoiceButtons } from '../../components/urge';
import { useUrgeBlockBridge } from '../../hooks/useUrgeBlockBridge';
import { useTranslation } from '../../hooks/useTranslation';
import { getSupabaseClient } from '../../lib/supabase';
import { AuthContext } from '../../context/AuthContextDefinition';

// =====================================================
// 类型定义
// =====================================================

type PagePhase = 'checking' | 'breathing' | 'choice' | 'redirecting';

// =====================================================
// 常量
// =====================================================

const BREATHING_DURATION = 38; // 呼吸阶段时长：4-7-8 呼吸法 × 2 循环
const DEFAULT_COOLDOWN_MINUTES = 15;

// =====================================================
// 组件实现
// =====================================================

export const UrgeSurfingPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useContext(AuthContext);
  const [searchParams] = useSearchParams();

  // URL 参数解析 - 应用名称由 Shortcuts 的"当前 App"变量直接提供
  const appName = searchParams.get('app') || t('urge.defaultAppName');
  // 使用应用名称作为唯一标识符（用于冷却检查等）
  const appId = appName;

  // Bridge Hook
  const {
    isNativeApp,
    openApp,
    setBypassClipboard,
    getSettings,
  } = useUrgeBlockBridge();

  // 状态
  const [phase, setPhase] = useState<PagePhase>('checking');
  const [remainingSeconds, setRemainingSeconds] = useState(BREATHING_DURATION);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取设置中的冷却时间
  const settings = getSettings();
  const cooldownMinutes = settings.cooldownMinutes || DEFAULT_COOLDOWN_MINUTES;

  /**
   * 页面加载时直接开始呼吸
   *
   * 注意：冷却检查已移除。现在使用剪贴板方式绕过循环：
   * - 当用户选择"继续使用应用"时，Lumi 设置剪贴板标记
   * - Shortcuts 自动化检查剪贴板，如果有标记则不打开 Lumi
   */
  useEffect(() => {
    if (!appId) {
      setError(t('urge.missingAppId'));
      return;
    }

    console.log(`🧘 [UrgeSurfingPage] 开始呼吸阶段，应用: ${appName}`);
    setPhase('breathing');
  }, [appId, appName, t]);

  /**
   * 记录事件到数据库
   *
   * @param eventType - 事件类型
   *   - 'intercepted': 应用被拦截（用户进入呼吸页面）
   *   - 'surfed': 成功冲浪（用户选择返回 Lumi）
   *   - 'breakthrough': 突破（用户选择继续使用应用）
   * @returns 事件记录结果，包含 eventId 和 cooldownExpiresAt；失败时返回 null
   */
  const recordEvent = useCallback(async (
    eventType: 'intercepted' | 'surfed' | 'breakthrough'
  ): Promise<{ eventId?: string; cooldownExpiresAt?: string } | null> => {
    if (!auth?.isLoggedIn) {
      console.warn('[UrgeSurfingPage] 用户未登录，跳过事件记录');
      return null;
    }

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase 未配置');
      }

      const { data, error: invokeError } = await supabase.functions.invoke('record-urge-event', {
        body: {
          blockedAppId: appId,
          blockedAppName: appName,
          eventType,
          surfingPhase: 'breathing',
          surfingDurationSeconds: eventType === 'intercepted' ? 0 : BREATHING_DURATION - remainingSeconds,
          cooldownMinutes: eventType === 'breakthrough' ? cooldownMinutes : undefined,
        },
      });

      if (invokeError) {
        throw invokeError;
      }

      console.log(`📝 [UrgeSurfingPage] 事件已记录: ${eventType}, eventId=${data?.eventId}`);
      return data;
    } catch (err) {
      console.error('[UrgeSurfingPage] 记录事件失败:', err);
      return null;
    }
  }, [auth?.isLoggedIn, appId, appName, cooldownMinutes, remainingSeconds]);

  /**
   * 呼吸完成回调
   */
  const handleBreathingComplete = useCallback(() => {
    console.log('✅ [UrgeSurfingPage] 呼吸完成，显示选择按钮');
    setPhase('choice');
  }, []);

  /**
   * 呼吸进度回调
   */
  const handleBreathingTick = useCallback((remaining: number) => {
    setRemainingSeconds(remaining);
  }, []);

  /**
   * 返回 Lumi（成功冲浪）
   */
  const handleReturnToLumi = useCallback(async () => {
    setIsLoading(true);

    try {
      await recordEvent('surfed');
      console.log('🏠 [UrgeSurfingPage] 返回 Lumi');
      navigate('/app/home', { replace: true });
    } catch (err) {
      console.error('[UrgeSurfingPage] 返回失败:', err);
      setError(t('urge.returnError'));
    } finally {
      setIsLoading(false);
    }
  }, [recordEvent, navigate, t]);

  /**
   * 继续使用应用（突破）
   */
  const handleContinueToApp = useCallback(async () => {
    setIsLoading(true);

    try {
      // 记录突破事件到数据库（用于分析）
      await recordEvent('breakthrough');

      console.log(`📱 [UrgeSurfingPage] 突破，打开应用: ${appId}`);
      setPhase('redirecting');

      // 设置绕过剪贴板，让 Shortcuts 知道这次打开是被允许的
      setBypassClipboard(appName);

      // 打开应用
      setTimeout(() => {
        openApp(appId);
      }, 500);
    } catch (err) {
      console.error('[UrgeSurfingPage] 突破失败:', err);
      setError(t('urge.breakthroughError'));
      setIsLoading(false);
    }
  }, [recordEvent, appId, appName, setBypassClipboard, openApp, t]);

  // =====================================================
  // 渲染
  // =====================================================

  // 错误状态
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-700 to-gray-900 flex flex-col items-center justify-center p-6">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 text-center max-w-sm">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fa-solid fa-exclamation-triangle text-red-400 text-2xl"></i>
          </div>
          <h2 className="text-white text-xl font-semibold mb-2">{t('urge.errorTitle')}</h2>
          <p className="text-white/70 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate('/app/home', { replace: true })}
            className="w-full py-3 bg-white text-gray-800 rounded-xl font-medium hover:bg-gray-100 transition-colors"
          >
            {t('urge.returnToLumi')}
          </button>
        </div>
      </div>
    );
  }

  // 检查中 / 重定向中
  if (phase === 'checking' || phase === 'redirecting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-700 flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <i className="fa-solid fa-spinner fa-spin text-white text-4xl"></i>
          <p className="text-white/80">
            {phase === 'checking' ? t('urge.checking') : t('urge.redirecting')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 flex flex-col items-center justify-center p-6 safe-area-inset">
      {/* 应用信息 */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4">
          <i className="fa-solid fa-mobile-screen text-white text-2xl"></i>
        </div>
        <h1 className="text-white text-2xl font-bold mb-2">
          {t('urge.title')}
        </h1>
        <p className="text-white/70 text-sm">
          {t('urge.subtitle', { appName })}
        </p>
      </div>

      {/* 呼吸阶段 */}
      {phase === 'breathing' && (
        <>
          <BreathingAnimation
            isActive={true}
            totalDuration={BREATHING_DURATION}
            onComplete={handleBreathingComplete}
            onTick={handleBreathingTick}
          />

          {/* 开发者跳过按钮 - 仅在开发模式下显示 */}
          {import.meta.env.DEV && (
            <button
              onClick={handleBreathingComplete}
              className="mt-6 px-4 py-2 bg-yellow-500/80 text-black text-sm font-medium rounded-lg"
            >
              [DEV] Skip Breathing
            </button>
          )}
        </>
      )}

      {/* 选择阶段 */}
      {phase === 'choice' && (
        <div className="flex flex-col items-center">
          {/* 成功提示 */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-green-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fa-solid fa-check text-green-400 text-3xl"></i>
            </div>
            <h2 className="text-white text-xl font-semibold mb-2">
              {t('urge.breathingComplete')}
            </h2>
            <p className="text-white/70 text-sm">
              {t('urge.nowChoose')}
            </p>
          </div>

          {/* 选择按钮 */}
          <ChoiceButtons
            appName={appName}
            cooldownMinutes={cooldownMinutes}
            onReturnToLumi={handleReturnToLumi}
            onContinueToApp={handleContinueToApp}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* 底部提示 - 仅在非原生环境显示 */}
      {!isNativeApp && (
        <div className="absolute bottom-8 text-center">
          <p className="text-white/40 text-xs">
            {t('urge.webModeHint')}
          </p>
        </div>
      )}
    </div>
  );
};

export default UrgeSurfingPage;
