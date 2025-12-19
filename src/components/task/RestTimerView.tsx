import { useState, useEffect } from 'react';

export interface RestTimerViewProps {
    /** 关闭回调 (倒计时结束或点击 I am back) */
    onClose: () => void;
}

type Mode = 'select' | 'countdown';

const TIME_OPTIONS = [2, 5, 10, 15, 20, 30];

/**
 * 格式化时间 MM:SS
 */
const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

export function RestTimerView({ onClose }: RestTimerViewProps) {
    const [mode, setMode] = useState<Mode>('select');
    const [selectedMinutes, setSelectedMinutes] = useState(5);
    const [timeLeft, setTimeLeft] = useState(0);

    // 倒计时逻辑
    useEffect(() => {
        if (mode !== 'countdown') return;

        if (timeLeft <= 0) {
            onClose();
            return;
        }

        const timer = setInterval(() => {
            setTimeLeft((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [mode, timeLeft, onClose]);

    const handleSet = () => {
        setTimeLeft(selectedMinutes * 60);
        setMode('countdown');
    };

    return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-50">
            {/* 容器 */}
            <div className="w-full max-w-md px-6 flex flex-col items-center">

                {mode === 'select' ? (
                    <>
                        {/* 标题 */}
                        <h2
                            className="mb-2"
                            style={{
                                color: '#EBEBEB',
                                fontFamily: 'Sansita, sans-serif',
                                fontSize: '25px',
                                fontWeight: 400,
                                lineHeight: '38.99px',
                                textTransform: 'capitalize',
                            }}
                        >
                            How Long ?
                        </h2>
                        <h1
                            className="mb-12 text-center"
                            style={{
                                color: '#F3FA93',
                                fontFamily: 'Sansita, sans-serif',
                                fontSize: '44.017px',
                                fontWeight: 400,
                                lineHeight: '60.946px',
                                textTransform: 'capitalize',
                            }}
                        >
                            AI Will Call<br />You Back
                        </h1>

                        {/* 时间选择列表 */}
                        <div className="flex flex-col gap-4 mb-12 w-full items-center h-48 overflow-y-auto no-scrollbar mask-image-gradient">
                            {TIME_OPTIONS.map((mins) => (
                                <button
                                    key={mins}
                                    onClick={() => setSelectedMinutes(mins)}
                                    className={`transition-all duration-300 ${selectedMinutes === mins ? 'opacity-100 scale-110' : 'opacity-40 scale-100'
                                        }`}
                                    style={{
                                        color: '#EBF8FE',
                                        fontFamily: 'Sansita, sans-serif',
                                        fontSize: '27.327px',
                                        fontWeight: 700,
                                        lineHeight: '41.042px',
                                        letterSpacing: '0.801px',
                                    }}
                                >
                                    {mins} mins
                                </button>
                            ))}
                        </div>

                        {/* Set 按钮 */}
                        <button
                            onClick={handleSet}
                            className="w-40 py-3 text-[#5A4A10] font-bold text-xl shadow-lg hover:brightness-110 transition-all active:scale-95"
                            style={{
                                borderRadius: '121.098px',
                                border: '1.211px solid rgba(190, 190, 190, 0.20)',
                                background: '#FAE267',
                                fontFamily: 'Sansita, sans-serif',
                            }}
                        >
                            Set
                        </button>
                    </>
                ) : (
                    <>
                        {/* 倒计时状态标题 */}
                        <h1
                            className="mb-12 text-center"
                            style={{
                                color: '#F3FA93',
                                fontFamily: 'Sansita, sans-serif',
                                fontSize: '44.017px',
                                fontWeight: 400,
                                lineHeight: '60.946px',
                                textTransform: 'capitalize',
                            }}
                        >
                            AI Will Call<br />You Back
                        </h1>

                        {/* 倒计时显示 */}
                        <div
                            className="mb-16 text-white font-bold"
                            style={{
                                fontFamily: 'Sansita, sans-serif',
                                fontSize: '96px',
                                textShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            }}
                        >
                            {formatTime(timeLeft)}
                        </div>

                        {/* I am back 按钮 */}
                        <button
                            onClick={onClose}
                            className="w-48 py-3 text-[#5A4A10] font-bold text-xl shadow-lg hover:brightness-110 transition-all active:scale-95"
                            style={{
                                borderRadius: '121.098px',
                                border: '1.211px solid rgba(190, 190, 190, 0.20)',
                                background: '#FAE267',
                                fontFamily: 'Sansita, sans-serif',
                            }}
                        >
                            I am back
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
