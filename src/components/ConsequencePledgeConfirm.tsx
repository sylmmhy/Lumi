/**
 * 承诺确认组件
 *
 * 全屏页面设计，用于解锁被锁定的应用
 * 用户需要通过语音或打字输入承诺内容才能解锁
 */

import { useState, useCallback, useEffect } from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useScreenTime } from '../hooks/useScreenTime';
import { useTranslation } from '../hooks/useTranslation';

export interface ConsequencePledgeConfirmProps {
  /** 承诺内容 */
  pledge: string;
  /** 任务名称 */
  taskName: string;
  /** 完整后果描述 */
  consequence: string;
  /** 任务计划时间（可选，如 "12:30 pm"） */
  scheduledTime?: string;
  /** 解锁成功回调 */
  onUnlocked?: () => void;
  /** 取消回调 */
  onCancel?: () => void;
}

/**
 * 承诺确认组件
 *
 * 全屏显示，用户需要输入（打字或语音）承诺内容才能解锁
 */
export function ConsequencePledgeConfirm({
  pledge,
  taskName,
  consequence,
  scheduledTime,
  onUnlocked,
  onCancel: _onCancel,
}: ConsequencePledgeConfirmProps) {
  // onCancel 保留用于未来扩展（如添加返回按钮）
  void _onCancel;
  const { t, uiLanguage } = useTranslation();
  const { acceptConsequence } = useScreenTime();

  /**
   * 将 UI 语言代码转换为语音识别 BCP-47 语言代码
   */
  const getSpeechLanguageCode = (uiLang: string): string => {
    const languageMap: Record<string, string> = {
      en: 'en-US',
      zh: 'zh-CN',
      ja: 'ja-JP',
      ko: 'ko-KR',
      es: 'es-ES',
      it: 'it-IT',
    };
    return languageMap[uiLang] || 'en-US';
  };

  const {
    isRecording,
    isProcessing,
    result,
    error: speechError,
    audioLevel,
    startRecording,
    stopRecording,
    cancelRecording,
    reset: resetSpeech,
    validateTextInput,
  } = useSpeechRecognition({
    language: getSpeechLanguageCode(uiLanguage),
    expectedPledge: pledge,
  });

  const [inputMode, setInputMode] = useState<'choice' | 'voice' | 'text'>('choice');
  const [textInput, setTextInput] = useState('');
  const [_validationResult, setValidationResult] = useState<{
    matched: boolean;
    similarity: number;
  } | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 处理语音识别结果
  useEffect(() => {
    if (result) {
      // 将语音识别的文字填入输入框
      if (result.text) {
        setTextInput(result.text);
      }

      // 如果后端已经判断语义匹配，直接解锁
      if (result.validation?.matched) {
        console.log('[Pledge] 语义匹配成功，自动解锁');
        handleUnlock();
      } else if (result.validation && !result.validation.matched && result.text) {
        // 语义不匹配，显示 AI 的动态反馈
        setValidationResult({
          matched: false,
          similarity: result.validation.similarity,
        });
        // 使用 AI 返回的 reason，如果没有则使用默认文案
        setError(result.validation.reason || t('pledge.errorMismatch'));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // 处理文本输入验证
  const handleTextValidation = useCallback(() => {
    if (!textInput.trim()) {
      setError(t('pledge.errorEmpty'));
      return;
    }

    const validation = validateTextInput(textInput);
    setValidationResult(validation);

    if (validation.matched) {
      handleUnlock();
    } else {
      setError(t('pledge.errorMismatch'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInput, validateTextInput, t]);

  // 解锁
  const handleUnlock = useCallback(async () => {
    setIsUnlocking(true);
    setError(null);

    try {
      // 调用 iOS 原生解锁
      acceptConsequence();
      onUnlocked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pledge.errorUnlock'));
    } finally {
      setIsUnlocking(false);
    }
  }, [acceptConsequence, onUnlocked, t]);

  // 开始语音输入
  const handleStartVoice = useCallback(async () => {
    setInputMode('voice');
    setError(null);
    setValidationResult(null);
    await startRecording();
  }, [startRecording]);

  // 停止语音输入
  const handleStopVoice = useCallback(async () => {
    await stopRecording();
  }, [stopRecording]);

  // 切换到文字输入
  const handleSwitchToText = useCallback(() => {
    setInputMode('text');
    setError(null);
    setValidationResult(null);
    cancelRecording();
  }, [cancelRecording]);

  // 返回选择界面
  const handleBack = useCallback(() => {
    setInputMode('choice');
    setError(null);
    setValidationResult(null);
    setTextInput('');
    resetSpeech();
  }, [resetSpeech]);

  // 格式化时间显示
  const formatTimeDisplay = () => {
    if (scheduledTime) {
      return scheduledTime;
    }
    // 默认显示当前时间
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes} ${ampm}`;
  };

  // 渲染选择模式（初始界面）
  const renderChoiceMode = () => (
    <div className="flex flex-col items-center gap-5 w-full px-6">
      {/* 说明文字 */}
      <p className="font-quicksand font-normal text-sm text-center text-[#6A6A7A] px-4">
        {t('pledge.repeatToUnlock')}
      </p>

      {/* 语音输入按钮 */}
      <button
        onClick={handleStartVoice}
        className="w-auto px-10 py-4 rounded-full text-white font-sansita font-bold text-[20px] transition-all hover:scale-105 active:scale-95 uppercase tracking-wide flex items-center gap-3"
        style={{
          background: 'linear-gradient(180deg, #7B19B7 -94.27%, #510B32 228.57%)',
          border: '1.211px solid rgba(190, 190, 190, 0.20)',
          borderRadius: '121.098px',
        }}
      >
        <MicIcon className="w-5 h-5" />
        {t('pledge.sayItOutLoud')}
      </button>

      {/* 文字输入链接 - 简洁的文字样式 */}
      <button
        onClick={handleSwitchToText}
        className="font-quicksand font-medium text-sm text-[#6A6A7A] hover:text-[#9A9AAA] transition-colors underline underline-offset-2"
      >
        {t('pledge.orTypeIt')}
      </button>
    </div>
  );

  // 渲染语音模式覆盖层 - 布局与基础页面一致，只是顶部内容变化
  const renderVoiceOverlay = () => (
    <div className="fixed inset-0 z-[120] flex flex-col" style={{ backgroundColor: '#1C1C28' }}>
      {/* 关闭按钮 */}
      <button
        onClick={handleBack}
        className="absolute top-12 right-6 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors z-10"
      >
        <CloseIcon className="w-5 h-5 text-white" />
      </button>

      {/* 顶部区域 - 与基础页面高度一致 */}
      <div className="w-full pt-20 pb-12 px-10">
        <h1
          className="font-sansita font-bold text-[42px] leading-[1.2] italic"
          style={{ color: '#F5D76E' }}
        >
          {t('pledge.pleaseRepeat')}
        </h1>
        {/* 错误提示 - 验证失败时显示 */}
        {(error || speechError) && (
          <div className="mt-4 p-3 rounded-lg" style={{
            background: 'linear-gradient(180deg, #7B19B7 -94.27%, #510B32 228.57%)',
            border: '1.211px solid rgba(190, 190, 190, 0.20)'
          }}>
            <p className="text-white text-sm font-quicksand">
              <span className="mr-2">⚠️</span>
              {error || speechError}
            </p>
          </div>
        )}
      </div>

      {/* 中间内容区域 - 与基础页面布局一致 */}
      <div className="flex-1 flex flex-col px-6">
        {/* 卡片居中容器 */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {/* 承诺卡片 - 磨砂玻璃效果，录音时发光闪烁 */}
          <div
            className={`w-full rounded-[14px] p-6 relative backdrop-blur-xl transition-all duration-300 ${isRecording ? 'recording-glow' : ''
              }`}
            style={{
              backgroundColor: 'rgba(44, 44, 60, 0.5)',
              border: isRecording ? '2px solid rgba(255, 255, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: isRecording
                ? '0 0 20px rgba(154, 122, 184, 0.5), 0 0 40px rgba(154, 122, 184, 0.3), 0 0 60px rgba(154, 122, 184, 0.1)'
                : '0 4px 30px rgba(0, 0, 0, 0.1)',
            }}
          >
            <span
              className="font-sansita text-[40px] absolute top-4 left-4"
              style={{ lineHeight: 1, color: '#5A5A6A' }}
            >
              {'\u201C'}
            </span>
            <div className="pt-8 pb-8 px-2">
              <p className="font-sansita text-base mb-3 capitalize italic text-white">
                {t('pledge.iAcceptConsequence')}
              </p>
              <p className="font-sansita text-[28px] leading-[1.2] text-white capitalize italic">
                {consequence}
              </p>
            </div>
            <span
              className="font-sansita text-[40px] absolute bottom-4 right-4"
              style={{ lineHeight: 1, color: '#5A5A6A' }}
            >
              {'\u201D'}
            </span>
          </div>
        </div>

        {/* 底部输入区域 */}
        <div className="w-full pb-6">
          <div className="flex flex-col items-center gap-5 w-full px-6">
            <p className="font-quicksand font-normal text-sm text-center text-[#6A6A7A] px-4">
              {t('pledge.repeatToUnlock')}
            </p>
            <button
              onClick={isRecording ? handleStopVoice : handleStartVoice}
              disabled={isProcessing}
              className="w-auto px-10 py-4 rounded-full font-sansita font-bold text-[20px] transition-all uppercase tracking-wide text-white hover:scale-105 active:scale-95 flex items-center gap-3"
              style={{
                background: 'linear-gradient(180deg, #7B19B7 -94.27%, #510B32 228.57%)',
                border: '1.211px solid rgba(190, 190, 190, 0.20)',
                borderRadius: '121.098px',
              }}
            >
              {isRecording && (
                <div className="flex items-center gap-[3px] h-6">
                  {[0.5, 0.75, 1, 0.75, 0.5].map((multiplier, i) => (
                    <div
                      key={i}
                      className="w-[5px] bg-white rounded-full transition-all duration-100"
                      style={{
                        height: `${Math.max(6, 6 + audioLevel * 18 * multiplier)}px`,
                      }}
                    />
                  ))}
                </div>
              )}
              {isRecording ? t('pledge.stopRecording') : isProcessing ? t('pledge.processing') : t('pledge.startRecording')}
            </button>
            <button
              onClick={handleSwitchToText}
              className="font-quicksand font-medium text-sm text-[#6A6A7A] hover:text-[#9A9AAA] transition-colors underline underline-offset-2"
            >
              {t('pledge.orTypeIt')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // 渲染文字输入模式覆盖层
  const renderTextOverlay = () => (
    <div className="fixed inset-0 z-[120] flex flex-col" style={{ backgroundColor: '#1C1C28' }}>
      {/* 关闭按钮 */}
      <button
        onClick={handleBack}
        className="absolute top-12 right-6 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors z-10"
      >
        <CloseIcon className="w-5 h-5 text-white" />
      </button>

      {/* 顶部标题区域 */}
      <div className="w-full pt-12 pb-4 px-6">
        <h1
          className="font-sansita font-bold text-[28px] leading-[1.2] italic"
          style={{ color: '#F5D76E' }}
        >
          {t('pledge.pleaseEnter')}
        </h1>
      </div>

      {/* 中间内容区域 */}
      <div className="flex-1 flex flex-col px-6 overflow-hidden">
        {/* 卡片 - 磨砂玻璃效果 */}
        <div
          className="w-full rounded-[14px] p-6 relative mb-4 backdrop-blur-xl"
          style={{
            backgroundColor: 'rgba(44, 44, 60, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
          }}
        >
          <span
            className="font-sansita text-[40px] absolute top-4 left-4"
            style={{ lineHeight: 1, color: '#5A5A6A' }}
          >
            {'\u201C'}
          </span>
          <div className="pt-8 pb-8 px-2">
            <p className="font-sansita text-base mb-3 capitalize italic text-white">
              {t('pledge.iAcceptConsequence')}
            </p>
            <p className="font-sansita text-[28px] leading-[1.2] text-white capitalize italic">
              {consequence}
            </p>
          </div>
          <span
            className="font-sansita text-[40px] absolute bottom-4 right-4"
            style={{ lineHeight: 1, color: '#5A5A6A' }}
          >
            {'\u201D'}
          </span>
        </div>

        {/* 错误提示 */}
        {(error || speechError) && (
          <div className="mb-4 p-3 rounded-lg" style={{
            background: 'linear-gradient(180deg, #7B19B7 -94.27%, #510B32 228.57%)',
            border: '1.211px solid rgba(190, 190, 190, 0.20)'
          }}>
            <p className="text-white text-sm font-quicksand">
              <span className="mr-2">⚠️</span>
              {error || speechError}
            </p>
          </div>
        )}

        {/* 输入框区域 */}
        <div className="relative">
          <textarea
            value={textInput}
            onChange={(e) => {
              setTextInput(e.target.value);
              setError(null);
              setValidationResult(null);
            }}
            placeholder={t('pledge.enterPlaceholder')}
            className="w-full h-24 p-4 pr-16 rounded-xl text-base resize-none focus:outline-none font-quicksand text-white placeholder-[#6A6A7A]"
            style={{ backgroundColor: '#2C2C3C', border: '1px solid #3C3C4C' }}
            autoFocus
          />
          <button
            onClick={handleTextValidation}
            disabled={!textInput.trim() || isUnlocking}
            className="absolute right-3 bottom-3 w-12 h-12 flex items-center justify-center transition-all disabled:opacity-50"
            style={{
              borderRadius: '121.098px',
              border: '1.211px solid rgba(190, 190, 190, 0.20)',
              background: 'linear-gradient(180deg, #7B19B7 -94.27%, #510B32 228.57%)'
            }}
          >
            <ArrowUpIcon className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>
    </div>
  );

  // 主渲染 - 基础页面始终渲染，覆盖层根据模式显示
  return (
    <>
      {/* 录音时卡片发光闪烁动画 + 音波动画 */}
      <style>{`
        @keyframes glowPulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(154, 122, 184, 0.5), 0 0 40px rgba(154, 122, 184, 0.3), 0 0 60px rgba(154, 122, 184, 0.1);
            border-color: rgba(255, 255, 255, 0.4);
          }
          50% {
            box-shadow: 0 0 30px rgba(154, 122, 184, 0.7), 0 0 50px rgba(154, 122, 184, 0.5), 0 0 80px rgba(154, 122, 184, 0.2), 0 0 100px rgba(245, 215, 110, 0.1);
            border-color: rgba(255, 255, 255, 0.6);
          }
        }
        .recording-glow {
          animation: glowPulse 2s ease-in-out infinite;
        }
        @keyframes soundBar {
          0%, 100% { height: 8px; }
          50% { height: 20px; }
        }
        .sound-bar {
          width: 4px;
          background: white;
          border-radius: 2px;
          animation: soundBar 0.5s ease-in-out infinite;
        }
        .sound-bar:nth-child(1) { animation-delay: 0s; }
        .sound-bar:nth-child(2) { animation-delay: 0.1s; }
        .sound-bar:nth-child(3) { animation-delay: 0.2s; }
        .sound-bar:nth-child(4) { animation-delay: 0.1s; }
        .sound-bar:nth-child(5) { animation-delay: 0s; }
      `}</style>

      {/* 基础页面 - 始终渲染，z-index 需要高于 BottomNavBar (z-[100]) */}
      <div className="fixed inset-0 flex flex-col z-[110]" style={{ backgroundColor: '#1A2238' }}>
        {/* 顶部深紫色区域 - 渐变背景 */}
        <div
          className="w-full pt-20 pb-12 px-10"
          style={{ background: 'linear-gradient(180deg, #421C57 0%, #1A2238 100%)' }}
        >
          <p className="font-quicksand font-bold text-base text-white/80 mb-2">
            {formatTimeDisplay()} · {t('pledge.timeTo')}
          </p>
          <h1
            className="font-sansita font-bold text-[42px] leading-[1.2] italic"
            style={{ color: '#F5D76E' }}
          >
            {taskName}.
          </h1>
        </div>

        {/* 中间深色内容区域 */}
        <div className="flex-1 flex flex-col px-6">
          {/* 卡片居中容器 */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {/* 承诺卡片 - 磨砂玻璃效果 + 轻微亮光 */}
            <div
              className="w-full rounded-[14px] p-6 relative backdrop-blur-xl"
              style={{
                backgroundColor: 'rgba(44, 44, 60, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 0 15px rgba(154, 122, 184, 0.15), 0 0 30px rgba(154, 122, 184, 0.08), 0 4px 30px rgba(0, 0, 0, 0.1)',
              }}
            >
              <span
                className="font-sansita text-[40px] absolute top-4 left-4"
                style={{ lineHeight: 1, color: '#5A5A6A' }}
              >
                {'\u201C'}
              </span>

              <div className="pt-8 pb-8 px-2">
                <p className="font-sansita text-base mb-3 capitalize italic text-white">
                  {t('pledge.iAcceptConsequence')}
                </p>
                <p className="font-sansita text-[28px] leading-[1.2] text-white capitalize italic">
                  {consequence}
                </p>
              </div>

              <span
                className="font-sansita text-[40px] absolute bottom-4 right-4"
                style={{ lineHeight: 1, color: '#5A5A6A' }}
              >
                {'\u201D'}
              </span>
            </div>
          </div>

          {/* 底部输入区域 */}
          <div className="w-full pb-6">
            {renderChoiceMode()}
          </div>
        </div>
      </div>

      {/* 语音模式覆盖层 */}
      {inputMode === 'voice' && renderVoiceOverlay()}

      {/* 文字输入模式覆盖层 */}
      {inputMode === 'text' && renderTextOverlay()}
    </>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        d="M5 10l7-7m0 0l7 7m-7-7v18"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

export default ConsequencePledgeConfirm;
