import React from 'react';
import type {
  CampfirePresenceState,
  CampfireSoundscapeId,
  CampfireSoundscapePreset,
} from './campfireConfig';

interface CampfireControlsProps {
  /** 返回按钮点击回调 */
  onBack: () => void;
  /** 是否正在播放音频 */
  isPlayingSound: boolean;
  /** 音频开关回调 */
  onToggleSound: () => void;
  /** 结束会话回调（可选，用于生产环境） */
  onEndSession?: () => void;
  /** 当前氛围状态（用于状态文案） */
  presenceState?: CampfirePresenceState;
  /** 可选环境音列表 */
  soundscapeOptions?: CampfireSoundscapePreset[];
  /** 当前环境音 */
  selectedSoundscape?: CampfireSoundscapeId;
  /** 切换环境音 */
  onSelectSoundscape?: (id: CampfireSoundscapeId) => void;
  /** 是否显示调试按钮（说话切换） */
  showDebugControls?: boolean;
  /** 是否正在说话（仅调试用） */
  isSpeaking?: boolean;
  /** 说话切换回调（仅调试用） */
  onToggleSpeaking?: () => void;
  /** 进入静默模式（调试） */
  onEnterSilentMode?: () => void;
}

/**
 * 篝火陪伴模式控制栏
 *
 * 顶部固定的控制按钮，包括：
 * - 返回按钮（左侧）
 * - 音频开关（右侧）
 * - 调试按钮（开发环境）
 */
export const CampfireControls: React.FC<CampfireControlsProps> = ({
  onBack,
  isPlayingSound,
  onToggleSound,
  onEndSession,
  presenceState = 'active',
  soundscapeOptions = [],
  selectedSoundscape = 'campfire',
  onSelectSoundscape,
  showDebugControls = false,
  isSpeaking = false,
  onToggleSpeaking,
  onEnterSilentMode,
}) => {
  const statusText =
    presenceState === 'silent'
      ? '安静陪伴中'
      : presenceState === 'connecting'
        ? '正在连接'
        : '活跃陪伴中';

  return (
    <div className="absolute left-4 right-4 top-4 z-50 flex items-start justify-between gap-3">
      <div className="flex flex-col gap-2">
        {/* 返回按钮 */}
        <button
          onClick={onBack}
          className="w-fit rounded-full bg-black/40 px-4 py-2 text-sm text-white backdrop-blur-sm transition-colors hover:bg-black/60"
        >
          ← 返回
        </button>
        <div className="w-fit rounded-full bg-black/35 px-3 py-1 text-xs text-orange-100 backdrop-blur-sm">
          🔥 {statusText}
        </div>
      </div>

      {/* 右侧按钮组 */}
      <div className="flex flex-wrap justify-end gap-2">
        {/* 环境音切换 */}
        {soundscapeOptions.length > 0 && onSelectSoundscape && (
          <select
            value={selectedSoundscape}
            onChange={(event) => onSelectSoundscape(event.target.value as CampfireSoundscapeId)}
            className="rounded-full border border-white/20 bg-black/45 px-3 py-2 text-xs text-orange-100 backdrop-blur-sm outline-none transition-colors hover:bg-black/60"
            aria-label="切换环境音"
          >
            {soundscapeOptions.map((option) => (
              <option key={option.id} value={option.id} disabled={!option.isAvailable}>
                {option.label}{option.isAvailable ? '' : '（待上线）'}
              </option>
            ))}
          </select>
        )}

        {/* 白噪音播放按钮 */}
        <button
          onClick={onToggleSound}
          className={`rounded-full px-4 py-2 text-sm transition-colors ${
            isPlayingSound
              ? 'bg-orange-500/80 text-white'
              : 'bg-black/40 text-white backdrop-blur-sm hover:bg-black/60'
          }`}
        >
          {isPlayingSound ? '🔥 Sound On' : '🔇 Sound Off'}
        </button>

        {/* 结束会话按钮（生产环境） */}
        {onEndSession && (
          <button
            onClick={onEndSession}
            className="rounded-full bg-red-500/80 px-4 py-2 text-sm text-white backdrop-blur-sm transition-colors hover:bg-red-600/80"
          >
            结束会话
          </button>
        )}

        {showDebugControls && onEnterSilentMode && (
          <button
            onClick={onEnterSilentMode}
            className="rounded-full bg-indigo-500/75 px-4 py-2 text-sm text-white backdrop-blur-sm transition-colors hover:bg-indigo-600/80"
          >
            🤫 进入静默模式
          </button>
        )}

        {/* 说话切换按钮（调试用） */}
        {showDebugControls && onToggleSpeaking && (
          <button
            onClick={onToggleSpeaking}
            className={`rounded-full px-4 py-2 text-sm transition-colors ${
              isSpeaking
                ? 'bg-green-500/80 text-white'
                : 'bg-black/40 text-white backdrop-blur-sm hover:bg-black/60'
            }`}
          >
            {isSpeaking ? '🔊 Speaking' : '🔇 Silent'}
          </button>
        )}
      </div>
    </div>
  );
};
