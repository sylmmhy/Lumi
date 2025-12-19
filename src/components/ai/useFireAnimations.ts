import { useState, useEffect, useRef } from 'react';

// 嘴巴形状定义
export const MOUTH_PATHS = {
    // 原来的圆形 (rx=4, ry=3) 近似 Path (中心在 0,0)
    circle: "M -4,0 a 4,3 0 1,0 8,0 a 4,3 0 1,0 -8,0",
    // 张嘴 (已重新计算，中心在 0,0)
    open: "M 3.0997 -2.5850 C 4.1198 -2.5850 6.0558 -3.0685 7.7977 -3.5473 C 8.8258 -3.8298 9.7827 -2.9235 9.5464 -1.8838 C 9.4920 -1.6443 9.3758 -1.4232 9.2095 -1.2424 L 7.7741 0.3179 C 6.6319 1.5596 5.1757 2.4701 3.5592 2.9532 L 3.3239 3.0235 C 1.5891 3.5420 -0.2519 3.5925 -2.0125 3.1700 L -3.9418 2.7069 C -5.2877 2.3839 -6.5344 1.7371 -7.5735 0.8227 L -8.3936 0.1009 C -8.8070 -0.2628 -9.1336 -0.7145 -9.3494 -1.2211 C -9.7224 -2.0962 -9.5778 -3.0461 -8.6369 -3.1867 C -5.6754 -3.6294 1.3685 -2.5850 3.0997 -2.5850 Z",
    // 难过/撇嘴 (已重新计算，中心在 0,0)
    idle: "M 2.2920 -0.9240 C 3.2155 -0.9240 5.1398 -1.1882 6.6009 -1.3945 C 6.9992 -1.4508 7.3019 -1.0459 7.1355 -0.6796 C 7.0896 -0.5786 7.0120 -0.4954 6.9146 -0.4424 L 5.3782 0.3927 C 4.7899 0.7124 4.1502 0.9266 3.4881 1.0255 L 2.2113 1.2163 C 1.0582 1.3887 -0.1128 1.4056 -1.2704 1.2667 L -3.5562 0.9924 C -4.1993 0.9152 -4.8275 0.7434 -5.4203 0.4825 L -6.5855 -0.0301 C -6.7259 -0.0919 -6.8506 -0.1847 -6.9501 -0.3015 C -7.2600 -0.6651 -7.1812 -1.0857 -6.7058 -1.1328 C -4.6169 -1.3401 0.9538 -0.9240 2.2920 -0.9240 Z"
};

export type MouthShape = keyof typeof MOUTH_PATHS;

/**
 * 眨眼动画 Hook
 * 控制眼睛的开合状态
 */
export const useBlinkAnimation = () => {
    const [isBlinking, setIsBlinking] = useState(false);
    const blinkTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        const blinkLoop = () => {
            setIsBlinking(true);
            setTimeout(() => setIsBlinking(false), 150);
            const nextBlink = Math.random() * 3000 + 2000;
            blinkTimeoutRef.current = window.setTimeout(blinkLoop, nextBlink);
        };
        blinkTimeoutRef.current = window.setTimeout(blinkLoop, 2000);
        return () => {
            if (blinkTimeoutRef.current) {
                clearTimeout(blinkTimeoutRef.current);
            }
        };
    }, []);

    return isBlinking;
};

/**
 * 说话动画 Hook
 * 控制嘴巴的张开程度和形状
 */
export const useTalkAnimation = (isSpeaking: boolean) => {
    const [mouthOpenness, setMouthOpenness] = useState(0);
    const [mouthShape, setMouthShape] = useState<MouthShape>('idle');
    const talkTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isSpeaking) {
            // 延迟重置状态，避免在 effect 中同步 setState 导致级联渲染
            queueMicrotask(() => {
                setMouthOpenness(0);
                setMouthShape('idle');
            });
            if (talkTimeoutRef.current) {
                clearTimeout(talkTimeoutRef.current);
            }
            return;
        }

        const talkLoop = () => {
            const targetOpenness = Math.random() * 0.7 + 0.3;
            setMouthOpenness(targetOpenness);

            // 说话时：50% 概率是圆形，50% 概率是张嘴
            const rand = Math.random();
            if (rand > 0.5) setMouthShape('circle');
            else setMouthShape('open');

            const nextTalk = Math.random() * 100 + 50;
            talkTimeoutRef.current = window.setTimeout(talkLoop, nextTalk);
        };

        talkTimeoutRef.current = window.setTimeout(talkLoop, 0);
        return () => {
            if (talkTimeoutRef.current) {
                clearTimeout(talkTimeoutRef.current);
            }
        };
    }, [isSpeaking]);

    return { mouthOpenness, mouthShape };
};

/**
 * 呼吸动画 Hook
 * 控制整体的缩放，模拟呼吸效果
 *
 * @param {boolean} isSpeaking - 当前是否处于说话状态，用于决定呼吸幅度
 * @returns {number} breathingScale - 当前应当应用的缩放比例
 */
export const useBreathingAnimation = (isSpeaking: boolean) => {
    const [breathingScale, setBreathingScale] = useState(1);
    const requestRef = useRef<number | null>(null);

    useEffect(() => {
        const animate = (time: number) => {
            // 基础呼吸：平滑的正弦缩放
            const baseScale = 1 + Math.sin(time * 0.002) * 0.03;

            // 说话时叠加轻微波动，但改为正弦而非随机噪声，避免抖动
            const speakingPulse = isSpeaking ? Math.sin(time * 0.015) * 0.015 : 0;

            // 通过缓动让数值平滑过渡，防止快速跳变导致“颤抖”
            const targetScale = baseScale + speakingPulse;
            setBreathingScale((prev) => prev + (targetScale - prev) * 0.12);

            requestRef.current = requestAnimationFrame(animate);
        };
        requestRef.current = requestAnimationFrame(animate);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isSpeaking]);

    return breathingScale;
};

/**
 * 眼球移动动画 Hook
 * 不说话时，眼球会随机左右看
 */
export const useEyeMovementAnimation = (isSpeaking: boolean) => {
    const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
    const eyeMoveTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        // 说话时，眼神回正 (或者也可以让它动，但为了专注感先回正)
        if (isSpeaking) {
            // 延迟重置状态，避免在 effect 中同步 setState 导致级联渲染
            queueMicrotask(() => {
                setEyeOffset({ x: 0, y: 0 });
            });
            if (eyeMoveTimeoutRef.current) {
                clearTimeout(eyeMoveTimeoutRef.current);
            }
            return;
        }

        const moveLoop = () => {
            const rand = Math.random();
            let newX = 0;

            // 20% 概率看左边 (-3)
            // 20% 概率看右边 (3)
            // 60% 概率看中间 (0)
            if (rand < 0.2) newX = -3;
            else if (rand < 0.4) newX = 3;
            else newX = 0;

            setEyeOffset({ x: newX, y: 0 });

            // 下次移动的时间间隔 (2-5秒)
            const nextMove = Math.random() * 3000 + 2000;
            eyeMoveTimeoutRef.current = window.setTimeout(moveLoop, nextMove);
        };

        eyeMoveTimeoutRef.current = window.setTimeout(moveLoop, 2000);
        return () => {
            if (eyeMoveTimeoutRef.current) {
                clearTimeout(eyeMoveTimeoutRef.current);
            }
        };
    }, [isSpeaking]);

    return eyeOffset;
};

/**
 * 集中调度火焰动画的 Hook，统一管理说话、呼吸、眼球与眨眼的状态，减少组件层的 wiring 复杂度。
 *
 * @param {boolean} isSpeaking - 外部传入的说话开关，控制动画启动/停止
 * @returns {{
 *  isBlinking: boolean,
 *  mouthOpenness: number,
 *  mouthShape: MouthShape,
 *  breathingScale: number,
 *  eyeOffset: { x: number; y: number; }
 * }} - 汇总后的动画状态集合
 */
export const useFireAnimationController = (isSpeaking: boolean) => {
    const isBlinking = useBlinkAnimation();
    const { mouthOpenness, mouthShape } = useTalkAnimation(isSpeaking);
    const breathingScale = useBreathingAnimation(isSpeaking);
    const eyeOffset = useEyeMovementAnimation(isSpeaking);

    return {
        isBlinking,
        mouthOpenness,
        mouthShape,
        breathingScale,
        eyeOffset,
    };
};
