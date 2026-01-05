import type { RefObject } from 'react';
import { PhoneOff } from 'lucide-react';

interface TrialCallViewProps {
  cameraEnabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  isConnected: boolean;
  error: string | null;
  timeRemaining: number;
  waveformHeights: number[];
  habitName: string;
  onEndCall: () => void;
}

/**
 * 试用通话视图
 * 简化版的 Gemini Live 通话界面
 */
export function TrialCallView({
  cameraEnabled,
  videoRef,
  isConnected,
  error,
  timeRemaining,
  waveformHeights,
  habitName,
  onEndCall,
}: TrialCallViewProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-900 z-50">
      {/* 相机预览区域 */}
      <div className="relative flex-1 m-4 rounded-3xl overflow-hidden bg-black">
        {cameraEnabled ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-white/50">Camera Off</p>
          </div>
        )}

        {/* 顶部计时器 */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-6 py-2 bg-white/50 rounded-full">
          <span className="text-3xl font-bold text-orange-500">
            {formatTime(timeRemaining)}
          </span>
        </div>

        {/* 习惯名称 */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/50 rounded-full">
          <span className="text-sm font-medium text-orange-500">
            {habitName}
          </span>
        </div>

        {/* 音频波形 */}
        <div className="absolute left-6 bottom-6 h-12 flex gap-1 items-center">
          {waveformHeights.map((height, index) => (
            <div
              key={index}
              className="w-2 bg-white/80 rounded-full transition-all duration-150"
              style={{ height: `${height}px` }}
            />
          ))}
        </div>

        {/* 连接状态 */}
        <div className="absolute right-6 bottom-6 flex items-center gap-2 px-3 py-2 bg-white/20 rounded-full">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
            }`}
          />
          <span className="text-xs text-white font-medium uppercase">
            {isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>

        {/* 错误显示 */}
        {error && (
          <div className="absolute top-32 left-4 right-4 bg-red-500/90 rounded-xl p-3">
            <p className="text-sm text-white text-center">{error}</p>
          </div>
        )}
      </div>

      {/* 底部操作按钮 */}
      <div className="p-4 pb-8">
        <button
          onClick={onEndCall}
          className="w-full py-4 bg-red-500 hover:bg-red-600
                     text-white text-lg font-medium rounded-full
                     transition-colors flex items-center justify-center gap-2"
        >
          <PhoneOff className="w-5 h-5" />
          <span>End Call</span>
        </button>
      </div>
    </div>
  );
}
