import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabase';

/**
 * 庆祝动画 Hook - 管理庆祝页面的各种动画
 * 
 * 功能：
 * - 场景切换（彩纸 → 金币 → 进度条 → CTA 按钮）
 * - 金币数量动画计数
 * - 进度条填充动画
 * - 庆祝音效播放
 */

export type SuccessScene = 1 | 2 | 3 | 4 | 5;

export interface UseCelebrationAnimationOptions {
  /** 是否启用动画 */
  enabled: boolean;
  /** 剩余时间（秒），用于计算奖励 */
  remainingTime: number;
  /** 目标进度百分比，默认 80 */
  targetProgress?: number;
  /** 是否播放音效，默认 true */
  playSound?: boolean;
  /** 自定义金币数量（如果不传，会从后端计算） */
  customCoins?: number;
}

export interface CelebrationAnimationState {
  /** 当前场景 (1-5) */
  scene: SuccessScene;
  /** 金币数量 */
  coins: number;
  /** 进度百分比 */
  progressPercent: number;
  /** 是否显示彩带 */
  showConfetti: boolean;
}

export function useCelebrationAnimation(options: UseCelebrationAnimationOptions): CelebrationAnimationState {
  const {
    enabled,
    remainingTime,
    targetProgress = 80,
    playSound = true,
    customCoins,
  } = options;

  const [state, setState] = useState<CelebrationAnimationState>({
    scene: 1,
    coins: 0,
    progressPercent: 0,
    showConfetti: true,
  });

  // 场景切换定时器
  useEffect(() => {
    if (!enabled) return;

    // 重置状态
    setState({
      scene: 1,
      coins: 0,
      progressPercent: 0,
      showConfetti: true,
    });

    // 播放庆祝音效
    if (playSound) {
      const celebrationAudio = new Audio('/Celebration the happy end..MP3');
      celebrationAudio.volume = 0.3;
      celebrationAudio.play().catch(error => {
        console.warn('播放庆祝音效失败:', error);
      });
    }

    // 0.5秒后停止彩带
    const confettiTimer = setTimeout(() => {
      if (import.meta.env.DEV) {
        console.log('🎊 停止彩带发射');
      }
      setState(prev => ({ ...prev, showConfetti: false }));
    }, 500);

    // 2.5秒后切换到场景2（金币）
    const scene2Timer = setTimeout(() => {
      if (import.meta.env.DEV) {
        console.log('🎬 切换到场景2（金币）');
      }
      setState(prev => ({ ...prev, scene: 2 }));
    }, 2500);

    // 4秒后切换到场景3（进度条）
    const scene3Timer = setTimeout(() => {
      if (import.meta.env.DEV) {
        console.log('🎬 切换到场景3（进度条）');
      }
      setState(prev => ({ ...prev, scene: 3 }));
    }, 4000);

    // 6秒后切换到场景4（CTA按钮）
    const scene4Timer = setTimeout(() => {
      if (import.meta.env.DEV) {
        console.log('🎬 切换到场景4（CTA按钮）');
      }
      setState(prev => ({ ...prev, scene: 4 }));
    }, 6000);

    return () => {
      clearTimeout(confettiTimer);
      clearTimeout(scene2Timer);
      clearTimeout(scene3Timer);
      clearTimeout(scene4Timer);
    };
  }, [enabled, playSound]);

  // 场景2：金币计数动画
  useEffect(() => {
    if (!enabled || state.scene !== 2) return;

    let timer: NodeJS.Timeout | null = null;

    const fetchCoinsAndAnimate = async () => {
      try {
        let targetCoins: number;

        // 如果有自定义金币数量，直接使用
        if (customCoins !== undefined) {
          targetCoins = customCoins;
        } else {
          // 从后端获取金币数量
          const supabase = getSupabaseClient();
          if (!supabase) {
            throw new Error('Supabase 未配置');
          }

          const { data, error } = await supabase.functions.invoke('calculate-task-rewards', {
            body: { remainingTime }
          });

          if (error) throw error;
          targetCoins = data.coins;
        }

        const duration = 1500; // 1.5秒
        const frameRate = 60;
        const totalFrames = (duration / 1000) * frameRate;
        const increment = targetCoins / totalFrames;

        let currentFrame = 0;
        timer = setInterval(() => {
          currentFrame++;
          if (currentFrame >= totalFrames) {
            setState(prev => ({ ...prev, coins: targetCoins }));
            if (timer) clearInterval(timer);
          } else {
            setState(prev => ({ ...prev, coins: Math.floor(increment * currentFrame) }));
          }
        }, 1000 / frameRate);
      } catch (error) {
        console.error('获取金币失败:', error);
        // 备用：使用基础金币
        setState(prev => ({ ...prev, coins: 200 }));
      }
    };

    fetchCoinsAndAnimate();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [enabled, state.scene, remainingTime, customCoins]);

  // 场景3：进度条填充动画
  useEffect(() => {
    if (!enabled || state.scene !== 3) return;

    const duration = 1500; // 1.5秒
    const frameRate = 60;
    const totalFrames = (duration / 1000) * frameRate;
    const increment = targetProgress / totalFrames;

    let currentFrame = 0;
    const timer = setInterval(() => {
      currentFrame++;
      if (currentFrame >= totalFrames) {
        setState(prev => ({ ...prev, progressPercent: targetProgress }));
        clearInterval(timer);
        if (import.meta.env.DEV) {
          console.log(`✅ 进度条填充完成 (${targetProgress}%)`);
        }
      } else {
        setState(prev => ({ ...prev, progressPercent: Math.floor(increment * currentFrame) }));
      }
    }, 1000 / frameRate);

    return () => clearInterval(timer);
  }, [enabled, state.scene, targetProgress]);

  return state;
}

