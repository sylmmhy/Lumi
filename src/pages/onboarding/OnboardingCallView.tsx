import type { RefObject } from 'react';

interface OnboardingCallViewProps {
    geminiLive: {
        cameraEnabled: boolean;
        videoRef: RefObject<HTMLVideoElement | null>;
        isConnected: boolean;
        error: string | null;
    };
    state: {
        timeRemaining: number;
        taskDescription: string;
    };
    waveformHeights: number[];
    handleEndTask: () => void;
    onRestart: () => void;
    isLoggedIn: boolean;
}

export function OnboardingCallView({
    geminiLive,
    state,
    waveformHeights,
    handleEndTask,
    onRestart,
    isLoggedIn,
}: OnboardingCallViewProps) {
    const {
        cameraEnabled,
        videoRef,
        isConnected,
        error
    } = geminiLive;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div
            className={`fixed inset-0 flex flex-col pt-[60px] ${isLoggedIn ? 'pb-[160px]' : 'pb-[80px]'} px-2 gap-2`}
            style={{ backgroundColor: '#1e1e1e' }}
        >
            {/* Large Camera Preview Background */}
            <div className="relative flex-1 overflow-hidden rounded-[32px] bg-black">
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
                        <p className="text-white/50 text-center">Camera Off</p>
                    </div>
                )}

                {/* Timer Badge (Top Center) */}
                <div
                    className="absolute top-[31px] left-1/2 -translate-x-1/2 flex items-center justify-center gap-[10px]"
                    style={{
                        padding: '10px 30px',
                        borderRadius: '200px',
                        background: 'rgba(255, 255, 255, 0.50)'
                    }}
                >
                    <span className="text-center capitalize" style={{
                        fontFamily: 'Sansita, sans-serif',
                        fontSize: '44px',
                        fontWeight: 400,
                        lineHeight: '1',
                        color: '#F67D01'
                    }}>
                        {formatTime(state.timeRemaining)}
                    </span>
                </div>

                {/* Task Display Badge (Below Timer) */}
                <div
                    className="absolute top-[107px] left-1/2 -translate-x-1/2"
                    style={{
                        display: 'inline-flex',
                        padding: '10px',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '10px',
                        borderRadius: '200px',
                        background: 'rgba(255, 255, 255, 0.50)',
                        maxWidth: '345px'
                    }}
                >
                    <span
                        style={{
                            fontFamily: 'Sansita, sans-serif',
                            fontSize: '16px',
                            fontWeight: 400,
                            color: '#F67D01',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}
                    >
                        {state.taskDescription}
                    </span>
                </div>

                {/* Audio Waveform Visualization (Bottom Left) */}
                <div className="absolute left-[44px] bottom-[22px] h-[48px] flex gap-[6px] items-center">
                    {waveformHeights.map((height, index) => (
                        <div
                            key={index}
                            className="bg-[#fbf3e9] rounded-[42px]"
                            style={{
                                width: '9px',
                                height: `${height}px`,
                                transition: 'height 0.2s ease-in-out'
                            }}
                        />
                    ))}
                </div>

                {/* AI Status Badge (Bottom Right) */}
                <div
                    className="absolute right-[22px] bottom-[22px] h-[48px] flex items-center gap-[4px] px-[8px] py-[4px]"
                    style={{
                        background: 'rgba(236, 236, 236, 0.3)',
                        borderRadius: '27.883px'
                    }}
                >
                    {/* Status Dot */}
                    <div
                        className={`rounded-full ${isConnected
                            ? 'bg-green-500'
                            : 'bg-yellow-500 animate-pulse'
                            }`}
                        style={{
                            width: '7.25px',
                            height: '7.25px'
                        }}
                    />
                    {/* Status Text */}
                    <span
                        className="text-white font-bold uppercase"
                        style={{
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '7.25px',
                            letterSpacing: '0.4461px'
                        }}
                    >
                        {isConnected ? 'AI COACH IS ALIVE' : 'CONNECTING...'}
                    </span>
                </div>

                {/* Error display */}
                {error && (
                    <div className="absolute top-16 left-4 right-4 bg-red-500/90 border border-red-400 rounded-xl p-3">
                        <p className="text-sm text-white">{error}</p>
                    </div>
                )}
            </div>

            {/* Bottom Action Buttons */}
            <div className="flex gap-2 w-full">
                {/* Restart Button - 1/3 width */}
                <button
                    onClick={onRestart}
                    className="flex-[1] h-[46px] bg-[#2c3039] border border-[#5a5c62] rounded-[16px] flex items-center justify-center gap-[10px] px-2 py-[14px]"
                    style={{
                        boxShadow: '0 4px 0 0 #444A58'
                    }}
                >
                    <span className="font-bold text-white uppercase tracking-[0.8px]" style={{
                        fontFamily: 'Inter, sans-serif',
                        whiteSpace: 'nowrap',
                        fontSize: 'clamp(10px, 3vw, 15px)',
                        lineHeight: '18px'
                    }}>
                        ❌ RESTART
                    </span>
                </button>

                {/* Done Button - 2/3 width */}
                <button
                    onClick={handleEndTask}
                    className="flex-[2] h-[46px] bg-gradient-to-t from-[#ffd039] to-[#feb827] border border-[#ffe28a] rounded-[16px] flex items-center justify-center gap-[10px] px-2 py-[14px]"
                    style={{
                        boxShadow: '0 6px 0 0 #D34A22'
                    }}
                >
                    <span className="font-bold text-black uppercase tracking-[0.8px]" style={{
                        fontFamily: 'Inter, Noto Sans JP, sans-serif',
                        whiteSpace: 'nowrap',
                        fontSize: 'clamp(10px, 3vw, 15px)',
                        lineHeight: '18px'
                    }}>
                        ✅ I&apos;M DOING IT!
                    </span>
                </button>
            </div>
        </div>
    );
}
