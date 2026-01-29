/**
 * BreathingAnimation 组件
 *
 * 4-7-8 呼吸动画组件，用于 Urge Surfing 冲动冲浪页面
 *
 * 呼吸节奏：
 * - 吸气 4 秒
 * - 屏住 7 秒
 * - 呼气 8 秒
 * - 循环 2 次（共 38 秒）
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

export interface BreathingAnimationProps {
  isActive: boolean;
  totalDuration?: number;
  onComplete?: () => void;
  onTick?: (remainingSeconds: number) => void;
}

type BreathPhase = 'inhale' | 'hold' | 'exhale';

/** 4-7-8 呼吸法：吸气4秒、屏息7秒、呼气8秒 */
const PHASE_DURATIONS: Record<BreathPhase, number> = {
  inhale: 4,
  hold: 7,
  exhale: 8,
};
const PHASE_SEQUENCE: BreathPhase[] = ['inhale', 'hold', 'exhale'];
/** 一个完整循环 = 4 + 7 + 8 = 19 秒 */
const CYCLE_DURATION = 19;
/** 默认 2 个循环 = 38 秒 */
const DEFAULT_CYCLES = 2;

export const BreathingAnimation: React.FC<BreathingAnimationProps> = ({
  isActive,
  totalDuration = CYCLE_DURATION * DEFAULT_CYCLES,
  onComplete,
  onTick,
}) => {
  const { t } = useTranslation();

  const [phase, setPhase] = useState<BreathPhase>('inhale');
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(totalDuration);
  const [isCompleted, setIsCompleted] = useState(false);

  const prevIsActiveRef = useRef(isActive);
  const hasResetRef = useRef(false);

  const getPhaseText = useCallback((p: BreathPhase): string => {
    switch (p) {
      case 'inhale': return t('urge.breatheIn');
      case 'hold': return t('urge.hold');
      case 'exhale': return t('urge.breatheOut');
    }
  }, [t]);

  const getPhaseColor = useCallback((p: BreathPhase): string => {
    switch (p) {
      case 'inhale': return 'from-blue-400 to-blue-600';
      case 'hold': return 'from-purple-400 to-purple-600';
      case 'exhale': return 'from-teal-400 to-teal-600';
    }
  }, []);

  useEffect(() => {
    if (isActive && !prevIsActiveRef.current && !hasResetRef.current) {
      hasResetRef.current = true;
      requestAnimationFrame(() => {
        setPhase('inhale');
        setPhaseProgress(0);
        setRemainingSeconds(totalDuration);
        setIsCompleted(false);
        hasResetRef.current = false;
      });
    }
    prevIsActiveRef.current = isActive;

    if (!isActive || isCompleted) return;

    let phaseIndex = 0;
    let phaseTime = 0;
    const intervalMs = 50;

    const timer = setInterval(() => {
      phaseTime += intervalMs;
      const currentPhaseDuration = PHASE_DURATIONS[PHASE_SEQUENCE[phaseIndex]];
      const progress = (phaseTime / (currentPhaseDuration * 1000)) * 100;

      if (progress >= 100) {
        phaseIndex = (phaseIndex + 1) % PHASE_SEQUENCE.length;
        phaseTime = 0;
        setPhase(PHASE_SEQUENCE[phaseIndex]);
        setPhaseProgress(0);
      } else {
        setPhaseProgress(progress);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isActive, isCompleted, totalDuration]);

  useEffect(() => {
    if (!isActive || isCompleted) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        onTick?.(next);
        if (next <= 0) {
          setIsCompleted(true);
          onComplete?.();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, isCompleted, onComplete, onTick]);

  const circleScale = phase === 'inhale'
    ? 1 + (phaseProgress / 100) * 0.3
    : phase === 'exhale'
      ? 1.3 - (phaseProgress / 100) * 0.3
      : 1.3;

  return (
    <div className="flex flex-col items-center justify-center space-y-8">
      <div className="relative w-64 h-64 flex items-center justify-center">
        <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"
            strokeLinecap="round" strokeDasharray={`${(1 - remainingSeconds / totalDuration) * 283} 283`}
            className="transition-all duration-1000 ease-linear" />
        </svg>
        <div
          className={`absolute w-48 h-48 rounded-full bg-gradient-to-br ${getPhaseColor(phase)} shadow-2xl transition-transform flex items-center justify-center`}
          style={{ transform: `scale(${circleScale})`, boxShadow: '0 0 60px rgba(255,255,255,0.3)' }}
        >
          <div className="text-center text-white">
            <p className="text-2xl font-medium tracking-wider animate-pulse">{getPhaseText(phase)}</p>
          </div>
        </div>
        <div className="absolute bottom-0 text-white/60 text-sm">{remainingSeconds}s</div>
      </div>
      <p className="text-white/80 text-center text-sm px-8">{t('urge.breathingHint')}</p>
    </div>
  );
};
