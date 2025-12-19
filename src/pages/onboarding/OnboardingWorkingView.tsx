interface OnboardingWorkingViewProps {
    workingSeconds: number;
    taskDescription: string;
    onComplete: () => void;
    onGiveUp: () => void;
}

export function OnboardingWorkingView({
    workingSeconds,
    taskDescription,
    onComplete,
    onGiveUp,
}: OnboardingWorkingViewProps) {
    return (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-12 px-6" style={{ backgroundColor: '#1e1e1e' }}>
            {/* Timer Display */}
            <div className="flex flex-col items-center gap-4">
                <span
                    className="text-center"
                    style={{
                        fontFamily: 'Sansita, sans-serif',
                        fontSize: '96px',
                        fontWeight: 400,
                        lineHeight: '1',
                        color: '#ffc92a'
                    }}
                >
                    {String(Math.floor(workingSeconds / 60)).padStart(2, '0')}:{String(workingSeconds % 60).padStart(2, '0')}
                </span>
                <p
                    className="text-center"
                    style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '18px',
                        fontWeight: 600,
                        color: '#ffffff'
                    }}
                >
                    {taskDescription || 'Working on your task...'}
                </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 w-full max-w-md">
                {/* Completed Button - Left */}
                <button
                    onClick={onComplete}
                    className="flex-1 h-[56px] bg-gradient-to-t from-[#ffd039] to-[#feb827] border border-[#ffe28a] rounded-[16px] flex items-center justify-center"
                    style={{ boxShadow: '0 6px 0 0 #D34A22' }}
                >
                    <span
                        className="font-bold uppercase"
                        style={{
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '15px',
                            letterSpacing: '0.8px',
                            color: '#000000'
                        }}
                    >
                        ✅ COMPLETED
                    </span>
                </button>

                {/* Give Up Button - Right */}
                <button
                    onClick={onGiveUp}
                    className="flex-1 h-[56px] bg-[#2c3039] border border-[#5a5c62] rounded-[16px] flex items-center justify-center"
                    style={{ boxShadow: '0 4px 0 0 #444A58' }}
                >
                    <span
                        className="font-bold uppercase"
                        style={{
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '15px',
                            letterSpacing: '0.8px',
                            color: '#ffffff'
                        }}
                    >
                        GIVE UP
                    </span>
                </button>
            </div>
        </div>
    );
}
