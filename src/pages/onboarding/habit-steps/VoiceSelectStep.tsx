import { useState, useRef } from 'react';
import { setVoiceName, type VoiceName, AVAILABLE_VOICES } from '../../../lib/voiceSettings';
import { useTranslation } from '../../../hooks/useTranslation';
import lumiHappy from '../../../assets/Lumi-happy.png';

interface VoiceSelectStepProps {
  onNext: () => void;
}

/**
 * Step 4: Voice Selection
 * 让用户选择 Lumi 的声音性别（男声 Puck / 女声 Zephyr）
 */
export function VoiceSelectStep({ onNext }: VoiceSelectStepProps) {
  const { t } = useTranslation();
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>('male');
  const [playingVoice, setPlayingVoice] = useState<VoiceName | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 获取男声和女声的配置（用于试听）
  const maleVoice = AVAILABLE_VOICES.find(v => v.name === 'Puck')!;
  const femaleVoice = AVAILABLE_VOICES.find(v => v.name === 'Zephyr')!;

  /**
   * 播放声音试听
   */
  const handlePlayPreview = (voice: { name: VoiceName; previewUrl: string }) => {
    // 如果正在播放同一个声音，停止播放
    if (playingVoice === voice.name && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlayingVoice(null);
      return;
    }

    // 停止当前播放
    if (audioRef.current) {
      audioRef.current.pause();
    }

    // 检查 URL 是否有效
    if (!voice.previewUrl) {
      console.warn('No preview URL for voice:', voice.name);
      return;
    }

    // 创建新的 Audio 实例并播放
    const audio = new Audio(voice.previewUrl);
    audioRef.current = audio;
    setPlayingVoice(voice.name);

    audio.play().catch(error => {
      console.error('Failed to play audio:', error);
      setPlayingVoice(null);
    });

    // 播放结束后重置状态
    audio.onended = () => {
      setPlayingVoice(null);
    };

    audio.onerror = () => {
      console.error('Audio playback error');
      setPlayingVoice(null);
    };
  };

  /**
   * 保存并继续
   */
  const handleContinue = () => {
    // 根据性别选择对应的声音
    const voiceName: VoiceName = selectedGender === 'male' ? 'Puck' : 'Zephyr';
    setVoiceName(voiceName);
    onNext();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* 可滚动内容区域 */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32">
        <div className="flex flex-col items-center text-center">
          {/* Lumi 头像 */}
          <img
            src={lumiHappy}
            alt="Lumi"
            className="w-24 h-24 mb-4 object-contain"
          />

          {/* 标题 */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {t('habitOnboarding.voiceSelect.title')}
          </h1>

          {/* 次标题 */}
          <p className="text-gray-500 mb-8">
            {t('habitOnboarding.voiceSelect.subtitle')}
          </p>

          {/* 性别选择卡片 */}
          <div className="w-full max-w-sm space-y-4">
            {/* 男声选项 */}
            <button
              onClick={() => setSelectedGender('male')}
              className={`w-full p-5 rounded-2xl border-2 transition-all flex items-center justify-between ${
                selectedGender === 'male'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-4">
                {/* 性别图标 */}
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                  selectedGender === 'male' ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  <i className={`fa-solid fa-mars text-2xl ${
                    selectedGender === 'male' ? 'text-blue-500' : 'text-gray-400'
                  }`}></i>
                </div>
                <div className="text-left">
                  <p className={`font-semibold text-lg ${
                    selectedGender === 'male' ? 'text-blue-700' : 'text-gray-800'
                  }`}>
                    {t('habitOnboarding.voiceSelect.male')}
                  </p>
                  <p className="text-sm text-gray-500">Puck</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* 试听按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayPreview(maleVoice);
                  }}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition-colors"
                  aria-label="Play male voice preview"
                >
                  <i className={`fa-solid ${playingVoice === 'Puck' ? 'fa-stop' : 'fa-play'} text-gray-600 text-sm`}></i>
                </button>
                {/* 选中指示 */}
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  selectedGender === 'male'
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-300'
                }`}>
                  {selectedGender === 'male' && (
                    <i className="fa-solid fa-check text-white text-xs"></i>
                  )}
                </div>
              </div>
            </button>

            {/* 女声选项 */}
            <button
              onClick={() => setSelectedGender('female')}
              className={`w-full p-5 rounded-2xl border-2 transition-all flex items-center justify-between ${
                selectedGender === 'female'
                  ? 'border-pink-500 bg-pink-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-4">
                {/* 性别图标 */}
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                  selectedGender === 'female' ? 'bg-pink-100' : 'bg-gray-100'
                }`}>
                  <i className={`fa-solid fa-venus text-2xl ${
                    selectedGender === 'female' ? 'text-pink-500' : 'text-gray-400'
                  }`}></i>
                </div>
                <div className="text-left">
                  <p className={`font-semibold text-lg ${
                    selectedGender === 'female' ? 'text-pink-700' : 'text-gray-800'
                  }`}>
                    {t('habitOnboarding.voiceSelect.female')}
                  </p>
                  <p className="text-sm text-gray-500">Zephyr</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* 试听按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayPreview(femaleVoice);
                  }}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition-colors"
                  aria-label="Play female voice preview"
                >
                  <i className={`fa-solid ${playingVoice === 'Zephyr' ? 'fa-stop' : 'fa-play'} text-gray-600 text-sm`}></i>
                </button>
                {/* 选中指示 */}
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  selectedGender === 'female'
                    ? 'border-pink-500 bg-pink-500'
                    : 'border-gray-300'
                }`}>
                  {selectedGender === 'female' && (
                    <i className="fa-solid fa-check text-white text-xs"></i>
                  )}
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* 固定底部按钮区域 */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white px-6 pt-4 z-10"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 24px), 24px)' }}
      >
        <div className="max-w-xs mx-auto">
          <button
            onClick={handleContinue}
            className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                       text-white text-lg font-medium rounded-full
                       transition-colors shadow-md"
          >
            {t('common.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
