import { useState, useEffect } from 'react';
import { RestTimerView } from './RestTimerView';

export interface SimpleTaskExecutionViewProps {
    /** 任务名称 */
    taskName: string;
    /** 关闭回调 */
    onClose: () => void;
    /** 完成任务回调 */
    onFinish: () => void;
    /** 休息回调 */
    onRest: () => void;
    /** 初始秒数，默认 0 */
    initialSeconds?: number;
}

/**
 * 格式化时间 MM:SS
 */
const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

export function SimpleTaskExecutionView({
    taskName,
    onClose,
    onFinish,
    onRest,
    initialSeconds = 0,
}: SimpleTaskExecutionViewProps) {
    const [seconds, setSeconds] = useState(initialSeconds);
    const [isResting, setIsResting] = useState(false);

    // 正计时逻辑 (休息时暂停)
    useEffect(() => {
        if (isResting) return;

        const timer = setInterval(() => {
            setSeconds((prev) => prev + 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [isResting]);

    const handleRest = () => {
        setIsResting(true);
        onRest?.();
    };

    const handleRestClose = () => {
        setIsResting(false);
    };

    return (
        <div className="fixed inset-0 flex flex-col bg-[#C0392B] z-50 overflow-hidden">
            {/* 休息计时器弹窗 */}
            {isResting && <RestTimerView onClose={handleRestClose} />}

            {/* 关闭按钮 */}
            <button
                onClick={onClose}
                className="absolute top-6 right-6 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors z-20"
            >
                ✕
            </button>

            {/* 上半部分内容 */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 pt-20 pb-10 relative z-10">
                <h1
                    className="mb-8 text-center"
                    style={{
                        color: '#FFF',
                        textAlign: 'center',
                        fontFamily: 'Sansita, sans-serif',
                        fontSize: '44.017px',
                        fontStyle: 'normal',
                        fontWeight: 400,
                        lineHeight: '60.946px',
                        textTransform: 'capitalize',
                    }}
                >
                    Let's Continue<br />Doing It.
                </h1>

                {/* 任务名胶囊 */}
                <div className="bg-[#A93226] px-8 py-3 rounded-full mb-12 shadow-inner">
                    <span className="text-white font-medium text-lg opacity-90">
                        {taskName}
                    </span>
                </div>

                {/* 计时器 */}
                <div
                    className="text-[120px] font-bold text-white leading-none tracking-wider italic"
                    style={{ fontFamily: 'Sansita, sans-serif' }}
                >
                    {formatTime(seconds)}
                </div>
            </div>

            {/* 底部白色弧形区域 */}
            <div className="relative w-full">
                {/* 弧形 SVG */}
                <div className="absolute top-0 left-0 right-0 -translate-y-[98%] z-0">
                    <svg viewBox="0 0 1440 100" className="w-full h-auto block text-white fill-current" preserveAspectRatio="none">
                        <path d="M0,100 C480,0 960,0 1440,100 L1440,100 L0,100 Z" />
                    </svg>
                </div>

                <div className="bg-white px-6 pb-12 pt-4 flex flex-col gap-4 items-center w-full">
                    {/* 按钮组 */}
                    <div className="w-full max-w-md flex flex-col gap-4">
                        {/* 休息按钮 */}
                        <button
                            onClick={handleRest}
                            className="w-full py-4 bg-[#F5F5F5] text-[#4A4A4A] rounded-full font-bold text-2xl shadow-lg hover:bg-gray-100 transition-all active:scale-95 italic"
                            style={{ fontFamily: 'Sansita, sans-serif' }}
                        >
                            Have A Rest
                        </button>

                        {/* 完成按钮 */}
                        <button
                            onClick={onFinish}
                            className="w-full py-4 bg-[#F1C40F] text-[#C0392B] rounded-full font-bold text-2xl shadow-lg hover:bg-[#F4D03F] transition-all active:scale-95 italic"
                            style={{ fontFamily: 'Sansita, sans-serif' }}
                        >
                            Finish this task
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
