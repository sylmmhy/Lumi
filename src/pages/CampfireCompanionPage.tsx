import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CampfireView } from '../components/campfire';
import { useAICoachSession } from '../hooks/useAICoachSession';
import { useAuth } from '../hooks/useAuth';
import { getPreferredLanguages } from '../lib/language';

/**
 * 篝火陪伴模式页面
 *
 * 提供「静默陪伴 + 空闲断开 + 自动重连 + 上下文连续」完整体验。
 */
export function CampfireCompanionPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [uiError, setUiError] = useState<string | null>(null);

  const aiCoach = useAICoachSession({
    initialTime: 300,
    sessionMode: 'campfire',
    enableIdleDisconnect: true,
    enableVirtualMessages: true,
    enableVAD: true,
  });
  const {
    canvasRef,
    startSession,
    endSession,
    stopAudioImmediately,
    sendTextMessage,
    isSessionActive,
    isConnecting,
    isSpeaking,
    isSilentMode,
    connectionError,
  } = aiCoach;

  useEffect(() => {
    if (auth.isSessionValidated && !auth.isLoggedIn) {
      auth.navigateToLogin('/campfire');
    }
  }, [auth]);

  const handleStartSession = useCallback(async () => {
    setUiError(null);
    try {
      const preferredLanguages = getPreferredLanguages();
      await startSession('Campfire Companion Session', {
        userId: auth.userId ?? undefined,
        userName: auth.userName ?? undefined,
        preferredLanguages: preferredLanguages.length > 0 ? preferredLanguages : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接失败，请重试';
      setUiError(message);
    }
  }, [startSession, auth.userId, auth.userName]);

  const handleEndSession = useCallback(() => {
    stopAudioImmediately();
    endSession();
  }, [stopAudioImmediately, endSession]);

  const handleBack = useCallback(() => {
    stopAudioImmediately();
    endSession();
    navigate('/app/urgency');
  }, [stopAudioImmediately, endSession, navigate]);

  const handleEnterSilentMode = useCallback(() => {
    sendTextMessage('Okay, I need to focus now. Please be quiet.');
  }, [sendTextMessage]);

  if (!auth.isSessionValidated) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#1D1B3D]">
        <div className="h-9 w-9 animate-spin rounded-full border-b-2 border-orange-300" />
      </div>
    );
  }

  if (!auth.isLoggedIn) {
    return null;
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-white md:bg-gray-100 flex flex-col items-center md:justify-center font-sans overflow-hidden">
      {/* Main Shell: 与 AppTabsPage 保持一致的手机壳样式 */}
      <div className="w-full h-full max-w-md bg-white md:h-[90vh] md:max-h-[850px] md:shadow-2xl md:rounded-[40px] overflow-hidden relative flex flex-col">
        <canvas ref={canvasRef} className="hidden" />
        <CampfireView
          onBack={handleBack}
          onStartSession={handleStartSession}
          onEndSession={handleEndSession}
          isSessionActive={isSessionActive}
          isConnecting={isConnecting}
          isAISpeaking={isSpeaking}
          isSilentMode={isSilentMode}
          onEnterSilentMode={import.meta.env.DEV ? handleEnterSilentMode : undefined}
          showDebugControls={import.meta.env.DEV}
        />

        {(uiError || connectionError) && (
          <div className="fixed left-1/2 top-8 z-[70] -translate-x-1/2 rounded-xl bg-red-500/85 px-4 py-2 text-sm text-white shadow-lg">
            {uiError || connectionError}
          </div>
        )}
      </div>
    </div>
  );
}
