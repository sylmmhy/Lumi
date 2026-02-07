/**
 * WeeklyCelebration - 周目标庆祝动画组件
 *
 * 设计理念:
 * - 全屏沉浸式庆祝体验
 * - 金色放射光芒 + EnergyBall 硬币掉落物理动画
 * - 打卡音效 + 硬币掉落音效
 * - 温暖激励的文案提示
 *
 * 使用场景:
 * - 用户完成本周第 N 次打卡时触发
 * - 达成周目标里程碑时展示
 */

import React, { useState, useEffect, useRef } from 'react';
import { EnergyBall } from '../stats';

export interface WeeklyCelebrationProps {
  /** 是否显示庆祝动画 */
  visible: boolean;
  /** 主标题 (默认: "Weekly Wins!") */
  title?: string;
  /** 副标题 (默认: "Small Wins, Big Change") */
  subtitle?: string;
  /** 当前硬币数量（传给 EnergyBall.current） */
  count: number;
  /** 硬币目标数量（传给 EnergyBall.target，默认 20） */
  target?: number;
  /** 底部激励文案 (默认: "You showed up! That's a win.") */
  message?: string;
  /** 关闭回调 */
  onClose: () => void;
  /** 自动关闭时长(毫秒),0 表示不自动关闭 (默认: 4000) */
  autoCloseDuration?: number;
  /** 背景颜色 (默认: 深绿色) */
  backgroundColor?: string;
  /** 是否禁用音效 (默认: false) */
  muted?: boolean;
}

/**
 * 播放打卡光晕音效
 */
const playCheckInSound = () => {
  const audio = new Audio('/checkin-sound.mp3');
  audio.volume = 0.7;
  audio.play().catch(err => console.log('音效播放失败:', err));
};

/**
 * 播放硬币掉落音效
 */
const playCoinDropSound = () => {
  const audio = new Audio('/coin-drop-sound.wav');
  audio.volume = 0.7;
  audio.play().catch(err => console.log('硬币音效播放失败:', err));
};

/**
 * 周庆祝动画组件
 *
 * 包含:
 * 1. 全屏深绿色背景
 * 2. 顶部文案 "Small Wins, Big Change"
 * 3. 主标题 "Weekly Wins!"
 * 4. 中心 EnergyBall（金色光芒 + 硬币掉落物理动画）
 * 5. 打卡音效 + 延迟 1 秒后硬币掉落音效
 * 6. 底部激励文案气泡
 */
export const WeeklyCelebration: React.FC<WeeklyCelebrationProps> = ({
  visible,
  title = 'Weekly Wins!',
  subtitle = 'Small Wins, Big Change',
  count,
  target = 20,
  message = "You showed up! That's a win.",
  onClose,
  autoCloseDuration = 4000,
  backgroundColor = '#429950',
  muted = false,
}) => {
  const [show, setShow] = useState(false);
  /** EnergyBall 显示的硬币数，先用 count-1 初始化，延迟后 +1 触发掉落动画 */
  const [displayCount, setDisplayCount] = useState(Math.max(count - 1, 0));
  /** 防止多次触发音效 */
  const soundPlayedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      // 先用 count-1 初始化，准备掉落动画
      setDisplayCount(Math.max(count - 1, 0));

      // 延迟显示，触发进入动画
      setTimeout(() => setShow(true), 50);

      // 播放音效 + 延迟 1 秒后新硬币掉落
      if (!soundPlayedRef.current) {
        soundPlayedRef.current = true;
        if (!muted) playCheckInSound();
        setTimeout(() => {
          // 硬币 +1，触发 EnergyBall 的掉落动画
          setDisplayCount(count);
          if (!muted) playCoinDropSound();
        }, 1000);
      }

      // 自动关闭
      if (autoCloseDuration > 0) {
        const timer = setTimeout(() => {
          setShow(false);
          setTimeout(onClose, 300);
        }, autoCloseDuration);
        return () => clearTimeout(timer);
      }
    } else {
      setShow(false);
      soundPlayedRef.current = false;
    }
  }, [visible, autoCloseDuration, onClose, muted, count]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor }}
    >
      {/* 内容区域 */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-6">
        {/* 副标题 - 淡入动画 */}
        <p
          className={`text-white/90 text-2xl italic text-center transition-all duration-700 delay-100 ${
            show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
          }`}
          style={{ fontFamily: "'Sansita', 'Georgia', serif" }}
        >
          {subtitle}
        </p>

        {/* 主标题 - 淡入 + 缩放动画 */}
        <h1
          className={`text-white italic font-bold text-5xl text-center transition-all duration-700 delay-200 ${
            show ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
          }`}
          style={{ fontFamily: "'Sansita', sans-serif" }}
        >
          {title}
        </h1>

        {/* 中心 EnergyBall（含金色光芒 + 硬币掉落物理动画） */}
        <div
          className={`relative transition-all duration-700 delay-300 ${
            show ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
          }`}
        >
          <EnergyBall
            current={displayCount}
            target={target}
            triggerRise={show}
          />
        </div>

        {/* 底部激励文案气泡 - 淡入动画 */}
        <div
          className={`
            px-8 py-4 rounded-full
            bg-gradient-to-r from-yellow-400 to-orange-400
            text-gray-800 font-semibold text-lg
            shadow-lg shadow-yellow-400/30
            transition-all duration-700 delay-500
            ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
          `}
          style={{
            fontFamily: "'Quicksand', sans-serif",
          }}
        >
          {message}
        </div>
      </div>

      {/* 点击遮罩关闭 */}
      <button
        onClick={() => {
          setShow(false);
          setTimeout(onClose, 300);
        }}
        className="absolute inset-0 cursor-default focus:outline-none"
        aria-label="Close celebration"
      />
    </div>
  );
};

export default WeeklyCelebration;
