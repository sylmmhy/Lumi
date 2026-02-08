import { useState, useEffect } from 'react';
import { CoinCounter, ConfettiEffect } from '../effects';
import { estimateCompletionCoins } from '../../constants/coinRewards';

/**
 * StartCelebrationView 组件的入参。
 * 控制开始庆祝页的关闭、继续、结束行为以及倒计时和金币展示。
 */
export interface StartCelebrationViewProps {
    /** 关闭回调 */
    onClose: () => void;
    /** 继续/完成回调 (倒计时结束或点击 Continue) */
    onContinue: () => void;
    /** 结束任务回调 */
    onFinish: () => void;
    /** 倒计时秒数，默认 10 */
    countdownSeconds?: number;
    /** 奖励金币数，默认使用统一奖励配置 */
    coins?: number;
}

/**
 * 庆祝图标 (Party Popper)
 */
const PartyPopperIcon = () => (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="10" y="80" fontSize="80">🎉</text>
    </svg>
);

/**
 * 任务开始时的庆祝页，包含彩带、金币动画与倒计时按钮。
 * 通过 props 控制关闭、继续与完成，遵循统一的 effects 出口复用动画组件。
 *
 * @param {StartCelebrationViewProps} props - 组件参数
 * @returns {JSX.Element} 开始庆祝界面
 */
export function StartCelebrationView({
    onClose,
    onContinue,
    onFinish,
    countdownSeconds = 10,
    coins = estimateCompletionCoins(true),
}: StartCelebrationViewProps) {
    const [timeLeft, setTimeLeft] = useState(countdownSeconds);

    // 倒计时逻辑
    useEffect(() => {
        if (timeLeft <= 0) {
            onContinue();
            return;
        }

        const timer = setInterval(() => {
            setTimeLeft((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [timeLeft, onContinue]);

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#C0392B] z-50">
            {/* 全屏彩带 - 使用自动模式，挂载时自动发射 500ms */}
            <ConfettiEffect trigger={true} />

            {/* 关闭按钮 */}
            <button
                onClick={onClose}
                className="absolute top-6 right-6 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors z-20"
            >
                ✕
            </button>

            <div className="flex flex-col items-center justify-center w-full max-w-md px-6 z-10 gap-8">
                {/* 图标 */}
                <div className="animate-bounce">
                    <PartyPopperIcon />
                </div>

                {/* 标题 */}
                <div className="text-center space-y-2">
                    <h1
                        className="text-5xl font-bold text-[#F1C40F]"
                        style={{ fontFamily: 'Sansita, sans-serif' }}
                    >
                        Good Job You
                    </h1>
                    <h1
                        className="text-5xl font-bold text-[#F1C40F]"
                        style={{ fontFamily: 'Sansita, sans-serif' }}
                    >
                        Just Start
                    </h1>
                </div>

                {/* 金币奖励 */}
                <div className="py-4">
                    <CoinCounter
                        targetCoins={coins}
                        animate={true}
                        duration={1500}
                        className="scale-125"
                    />
                </div>

                {/* 按钮组 */}
                <div className="flex flex-col gap-4 w-full mt-8">
                    {/* 倒计时按钮 */}
                    <button
                        onClick={onContinue}
                        className="w-full py-4 bg-[#F5F5F5] text-[#4A4A4A] rounded-full font-bold text-xl shadow-lg hover:bg-white transition-all active:scale-95 flex items-center justify-center gap-2"
                        style={{ fontFamily: 'Sansita, sans-serif' }}
                    >
                        Continue Doing It ({timeLeft})
                    </button>

                    {/* 完成任务按钮 */}
                    <button
                        onClick={onFinish}
                        className="w-full py-4 bg-[#F1C40F] text-[#C0392B] rounded-full font-bold text-xl shadow-lg hover:bg-[#F4D03F] transition-all active:scale-95"
                        style={{ fontFamily: 'Sansita, sans-serif' }}
                    >
                        Finish this task
                    </button>
                </div>
            </div>
        </div>
    );
}
