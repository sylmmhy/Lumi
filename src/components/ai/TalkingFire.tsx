import React, { useEffect } from 'react';
import { useFireAnimationController, MOUTH_PATHS } from './useFireAnimations';

interface TalkingFireProps {
    /** 是否正在说话 */
    isSpeaking: boolean;
    /** 大小，支持数字(px)或 CSS 字符串(如 "100%", "50vw") */
    size?: number | string;
    /** 自定义类名 */
    className?: string;
}

/**
 * 可爱的火焰角色组件，复用多段动画 Hook 实现眨眼、张口说话、呼吸与眼球转动。
 * 通过外部 `isSpeaking` 控制说话动画的开关，避免在 UI 直接操作动画细节。
 *
 * @param {TalkingFireProps} props - 控制说话状态、尺寸与自定义类名的参数集合
 */
export const TalkingFire: React.FC<TalkingFireProps> = ({
    isSpeaking,
    className = "",
    size = 200
}) => {
    // 集中调度 Hook，减少组件层的多处 wiring
    const { isBlinking, mouthOpenness, mouthShape, breathingScale, eyeOffset } = useFireAnimationController(isSpeaking);

    useEffect(() => {
        if (isSpeaking) {
            console.log('TalkingFire: 正在播放 speak 动画');
        }
    }, [isSpeaking]);

    return (
        <div
            className={`relative ${className}`}
            style={{
                width: size,
                height: size,
            }}
        >
            <svg
                viewBox="0 0 100 100"
                width="100%"
                height="100%"
                style={{
                    transform: `scale(${breathingScale})`,
                    transformOrigin: 'bottom center',
                    transition: 'transform 0.1s ease-out',
                    filter: 'drop-shadow(0 0 15px rgba(255, 160, 50, 0.6))'
                }}
            >
                <defs>
                    <radialGradient id="cuteFireGradient" cx="50" cy="75" r="45" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#FFFFE0" />   {/* 中心：亮黄色/白光 */}
                        <stop offset="20%" stopColor="#FFD700" />  {/* 金色 */}
                        <stop offset="60%" stopColor="#FF8C00" />  {/* 深橙色 */}
                        <stop offset="100%" stopColor="#FF2400" /> {/* 边缘：猩红色 */}
                    </radialGradient>
                    {/* 左眼皮渐变 - 反向平移以匹配身体渐变 */}
                    <radialGradient id="leftEyelidGradient" cx="50" cy="70" r="55" gradientUnits="userSpaceOnUse" gradientTransform="translate(-35, -55)">
                        <stop offset="0%" stopColor="#FFFFE0" />   {/* 中心：亮黄色/白光 */}
                        <stop offset="20%" stopColor="#FFD700" />  {/* 金色 */}
                        <stop offset="60%" stopColor="#FF8C00" />  {/* 深橙色 */}
                        <stop offset="100%" stopColor="#FF2400" /> {/* 边缘：猩红色 */}
                    </radialGradient>
                    {/* 右眼皮渐变 - 反向平移以匹配身体渐变 */}
                    <radialGradient id="rightEyelidGradient" cx="50" cy="70" r="55" gradientUnits="userSpaceOnUse" gradientTransform="translate(-65, -55)">
                        <stop offset="0%" stopColor="#FFFFE0" />   {/* 中心：亮黄色/白光 */}
                        <stop offset="20%" stopColor="#FFD700" />  {/* 金色 */}
                        <stop offset="60%" stopColor="#FF8C00" />  {/* 深橙色 */}
                        <stop offset="100%" stopColor="#FF2400" /> {/* 边缘：猩红色 */}
                    </radialGradient>

                    <clipPath id="eyeClip">
                        <circle cx="0" cy="0" r="7" />
                    </clipPath>
                </defs>

                <path
                    d="M 25,85 Q 10,75 15,55 Q 20,35 35,45 Q 45,15 65,35 Q 80,20 85,55 Q 90,75 75,85 Q 50,100 25,85 Z"
                    fill="url(#cuteFireGradient)"
                    stroke="none"
                >
                    <animate
                        attributeName="d"
                        dur="2s"
                        repeatCount="indefinite"
                        values="
                          M 25,85 Q 10,75 15,55 Q 20,35 35,45 Q 45,15 65,35 Q 80,20 85,55 Q 90,75 75,85 Q 50,100 25,85 Z;
                          M 26,84 Q 12,74 16,56 Q 22,38 36,46 Q 46,18 64,36 Q 78,22 84,56 Q 88,74 74,84 Q 50,98 26,84 Z;
                          M 25,85 Q 10,75 15,55 Q 20,35 35,45 Q 45,15 65,35 Q 80,20 85,55 Q 90,75 75,85 Q 50,100 25,85 Z
                        "
                    />
                </path>

                <g transform="translate(0, 5)">
                    {/* 左眼 */}
                    <g transform="translate(35, 55)">
                        {/* 眼白 - 保持圆形 */}
                        <circle
                            r="7"
                            fill="white"
                        />
                        {/* 眼珠 */}
                        <ellipse
                            cx={1 + eyeOffset.x} cy="0"
                            rx="2.5"
                            ry="2.5"
                            fill="black"
                            style={{ transition: 'cx 0.2s ease-out' }}
                        />
                        {/* 眼皮 - 使用与身体相同的渐变，产生"遮挡"效果 */}
                        {/* 使用 clipPath 确保眼皮只在眼球范围内显示 */}
                        <g clipPath="url(#eyeClip)">
                            <rect
                                x="-8"
                                y="-15"
                                width="16"
                                height={isBlinking ? 15 + 7 : 15 - 8} // 眨眼时盖住(y=7)，平时盖住一半(y=-2)
                                fill="url(#leftEyelidGradient)"
                                style={{
                                    transition: 'height 0.1s ease-out',
                                }}
                            />
                        </g>
                    </g>

                    {/* 右眼 */}
                    <g transform="translate(65, 55)">
                        <circle
                            r="7"
                            fill="white"
                        />
                        <ellipse
                            cx={-1 + eyeOffset.x} cy="0"
                            rx="2.5"
                            ry="2.5"
                            fill="black"
                            style={{ transition: 'cx 0.2s ease-out' }}
                        />
                        <g clipPath="url(#eyeClip)">
                            <rect
                                x="-8"
                                y="-15"
                                width="16"
                                height={isBlinking ? 15 + 7 : 15 - 8}
                                fill="url(#rightEyelidGradient)"
                                style={{
                                    transition: 'height 0.1s ease-out',
                                }}
                            />
                        </g>
                    </g>

                    <g transform="translate(50, 70)">
                        {/* 嘴巴 */}
                        <path
                            d={MOUTH_PATHS[mouthShape]}
                            fill="#751016"
                            transform={isSpeaking
                                ? `scale(${1 + mouthOpenness * 0.5})` // 说话时根据音量缩放
                                : `scale(1)`
                            }
                            style={{
                                transition: 'd 0.2s ease-out, transform 0.1s', // 平滑切换形状和大小
                            }}
                        />
                    </g>
                </g>
            </svg>
        </div >
    );
}
