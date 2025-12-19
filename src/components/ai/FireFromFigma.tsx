import { useEffect, useState, useRef } from 'react';
import fireImage from '../../assets/fire-from-figma.png';

interface FireFromFigmaProps {
    /** 是否正在说话 */
    isSpeaking?: boolean;
    /** 大小 (px) */
    size?: number;
    /** 自定义类名 */
    className?: string;
}

/**
 * 基于 Figma 设计的火焰组件
 *
 * 使用来自 Figma 的火焰图片资源，支持呼吸动画和说话时的跳动效果
 *
 * @param isSpeaking - 是否正在说话（影响动画强度）
 * @param size - 组件大小（默认 120px）
 * @param className - 自定义类名
 */
export function FireFromFigma({ isSpeaking = false, size = 120, className = '' }: FireFromFigmaProps) {
    // 呼吸动画引用
    const requestRef = useRef<number>(0);
    const [breathingScale, setBreathingScale] = useState(1);

    // 呼吸动画循环
    useEffect(() => {
        const animate = (time: number) => {
            // 使用正弦波模拟呼吸
            const scale = 1 + Math.sin(time * 0.002) * 0.03;
            setBreathingScale(scale);

            // 如果正在说话，火焰跳动更剧烈
            if (isSpeaking) {
                // 叠加高频抖动
                const flicker = Math.random() * 0.05;
                setBreathingScale(scale + flicker);
            }

            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current);
    }, [isSpeaking]);

    return (
        <div
            className={`relative flex items-center justify-center ${className}`}
            style={{
                width: size,
                height: size,
            }}
        >
            <img
                src={fireImage}
                alt="Fire"
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    transform: `scale(${breathingScale})`,
                    transformOrigin: 'bottom center',
                    transition: 'transform 0.1s ease-out',
                    filter: 'drop-shadow(0 0 10px rgba(255, 100, 0, 0.5))',
                }}
            />
        </div>
    );
}
