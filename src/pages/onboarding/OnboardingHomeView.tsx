import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Video } from 'lucide-react';

// Quick tags for fast input (sorted by usage frequency)
const QUICK_TAGS = [
    { emoji: '💪', text: 'Work out' },
    { emoji: '🛏️', text: 'Get out of bed' },
    { emoji: '😴', text: 'Go to sleep' },
    { emoji: '📚', text: 'Start reading' },
    { emoji: '🛁', text: 'Need to shower' },
    { emoji: '📝', text: 'Start studying' },
    { emoji: '✉️', text: 'Reply to emails' },
    { emoji: '📞', text: 'Make that call' },
    { emoji: '🍳', text: 'Cook dinner' },
    { emoji: '🧹', text: 'Clean up' },
];

// QuickTag Component - Single tag button with pill styling
interface QuickTagProps {
    emoji: string;
    text: string;
    onClick: () => void;
}

function QuickTag({ emoji, text, onClick }: QuickTagProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-white/90 hover:bg-white/10 active:scale-[0.97] transition-all duration-150 backdrop-blur-sm"
            style={{ fontFamily: 'Inter, sans-serif' }}
        >
            <span className="text-[15px] leading-none">{emoji}</span>
            <span className="text-[15px] leading-none whitespace-nowrap">{text}</span>
        </button>
    );
}

interface OnboardingHomeViewProps {
    taskInput: string;
    setTaskInput: (value: string) => void;
    isVoiceMode: boolean;
    startVoiceRecording: () => void;
    stopVoiceRecording: () => void;
    voiceWaveformHeights: number[];
    handleStartTask: () => void;
}

export function OnboardingHomeView({
    taskInput,
    setTaskInput,
    isVoiceMode,
    startVoiceRecording,
    stopVoiceRecording,
    voiceWaveformHeights,
    handleStartTask,
}: OnboardingHomeViewProps) {
    const navigate = useNavigate();
    const quickTagsScrollRef = useRef<HTMLDivElement | null>(null);
    const quickTagsAnimationRef = useRef<number | null>(null);
    const quickTagsVirtualScrollRef = useRef(0); // Keeps fractional progress for iOS where scrollLeft is rounded
    const quickTagsPauseRef = useRef(false);

    const pauseQuickTagsAutoScroll = () => {
        quickTagsPauseRef.current = true;
    };

    const resumeQuickTagsAutoScroll = () => {
        quickTagsPauseRef.current = false;
    };

    useEffect(() => {
        quickTagsVirtualScrollRef.current = quickTagsScrollRef.current?.scrollLeft || 0;

        const applyScrollPosition = (element: HTMLDivElement, value: number) => {
            // Force the scroll position first (works reliably on iOS Safari)
            element.scrollLeft = value;
            // Use scrollTo when available so other browsers stay smooth
            if (typeof element.scrollTo === 'function') {
                element.scrollTo({ left: value, behavior: 'auto' });
            }
        };

        const step = () => {
            const container = quickTagsScrollRef.current;

            // Auto-scroll logic (only when not paused)
            if (container && !quickTagsPauseRef.current) {
                const maxScrollable = container.scrollWidth - container.clientWidth;
                // Skip autoplay if there is nowhere to scroll.
                if (maxScrollable > 2) {
                    const resetPoint = container.scrollWidth / 2;
                    let newScroll = quickTagsVirtualScrollRef.current + 0.8;

                    if (newScroll >= resetPoint) {
                        newScroll = 0;
                    }

                    quickTagsVirtualScrollRef.current = newScroll;
                    applyScrollPosition(container, newScroll);
                }
            }

            quickTagsAnimationRef.current = requestAnimationFrame(step);
        };

        quickTagsAnimationRef.current = requestAnimationFrame(step);

        return () => {
            if (quickTagsAnimationRef.current) {
                cancelAnimationFrame(quickTagsAnimationRef.current);
            }
        };
    }, []);

    return (
        <div className="flex flex-col gap-16 relative">
            {/* Dev Mode Login Button - 开发模式下的登录/注册测试按钮 */}
            {import.meta.env.DEV && (
                <button
                    onClick={() => navigate('/login/mobile')}
                    className="fixed top-4 right-4 z-50 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg border-2 border-blue-300 transition-all"
                >
                    🔑 测试登录
                </button>
            )}

            {/* Top Section: Icon, Heading, Input, Button */}
            <div className="flex flex-col gap-12">
                {/* Icon & Heading */}
                <div className="flex flex-col gap-4 items-center">
                    {/* Fire Icon */}
                    <div className="text-8xl leading-none">🔥</div>

                    {/* Heading */}
                    <div className="flex flex-col items-center w-full text-center" style={{ fontFamily: 'Sansita, sans-serif' }}>
                        <p className="text-[25px] leading-[38.99px] text-[#ebebeb] capitalize whitespace-pre-wrap">
                            Procrastinating?
                        </p>
                        <p className="text-[25px] leading-[38.99px] text-[#ebebeb] capitalize whitespace-pre-wrap">
                            Let&apos;s Start It
                        </p>
                        <p className="text-[44.017px] leading-[60.946px] text-[#ffc92a] capitalize whitespace-pre-wrap">
                            In 5 Minutes!
                        </p>
                    </div>
                </div>

                {/* Input & Button */}
                <div className="flex flex-col gap-6 items-center">
                    {/* Input Box - Text Mode or Voice Mode */}
                    {!isVoiceMode ? (
                        // Text Mode - Input Box with Mic Button
                        <div className="relative w-full h-[82px] bg-[#2f2f2f] rounded-[16px]">
                            <textarea
                                value={taskInput}
                                onChange={(e) => setTaskInput(e.target.value)}
                                placeholder='What are you putting off?'
                                className="absolute inset-0 w-full h-full pl-[16.5px] pr-[60px] py-[16px] bg-transparent border-none outline-none text-[16px] leading-[25px] text-white placeholder:text-[#979797] resize-none"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && taskInput.trim()) {
                                        e.preventDefault();
                                        handleStartTask();
                                    }
                                }}
                                rows={2}
                            />
                            {/* Mic Icon Button */}
                            <button
                                onClick={startVoiceRecording}
                                className="absolute right-[16px] top-1/2 -translate-y-1/2 bg-[#666666] rounded-full p-[6.818px] hover:bg-[#777] transition-colors"
                                title="Voice input"
                                type="button"
                            >
                                <Mic className="w-[16.364px] h-[16.364px] text-[#b0b0b0]" />
                            </button>
                        </div>
                    ) : (
                        // Voice Mode - Waveform + "AI is listening." + Stop Button
                        <div className="relative w-full h-[82px] bg-[#2f2f2f] rounded-[16px] flex items-center justify-between px-6">
                            {/* Left: Audio Waveform */}
                            <div className="flex gap-[6px] items-center">
                                {voiceWaveformHeights.map((height, index) => (
                                    <div
                                        key={index}
                                        className="bg-[#c4c4c4] rounded-[42px]"
                                        style={{
                                            width: '9px',
                                            height: `${height}px`,
                                            transition: 'height 0.1s ease-in-out'
                                        }}
                                    />
                                ))}
                            </div>

                            {/* Center: "AI is listening." */}
                            <p className="text-[16px] text-[#979797] flex-1 text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
                                AI is listening.
                            </p>

                            {/* Right: Stop Button */}
                            <button
                                onClick={stopVoiceRecording}
                                className="bg-[#ff8c42] hover:bg-[#ff7829] rounded-[16px] px-6 py-2 flex items-center gap-2 transition-colors"
                                type="button"
                            >
                                <div className="w-3 h-3 bg-white rounded-[2px]" />
                                <span className="text-[16px] font-medium text-white" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    Stop
                                </span>
                            </button>
                        </div>
                    )}

                    {/* Quick Tags - Auto Scroll */}
                    <div className="relative w-full" style={{ maxWidth: '345px' }}>
                        <div className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-[#1e1e1e] to-transparent z-10 pointer-events-none" />
                        <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-[#1e1e1e] to-transparent z-10 pointer-events-none" />
                        <div
                            ref={quickTagsScrollRef}
                            className="flex gap-3 px-4 py-2 overflow-x-auto scrollbar-hide"
                            role="list"
                            style={{
                                scrollBehavior: 'auto',
                                WebkitOverflowScrolling: 'touch',
                                touchAction: 'pan-x'
                            }}
                            onMouseEnter={pauseQuickTagsAutoScroll}
                            onMouseLeave={resumeQuickTagsAutoScroll}
                            onTouchStart={pauseQuickTagsAutoScroll}
                            onTouchEnd={() => {
                                setTimeout(resumeQuickTagsAutoScroll, 300);
                            }}
                            onScroll={() => {
                                if (quickTagsPauseRef.current && quickTagsScrollRef.current) {
                                    // Sync virtual offset to the actual drag location
                                    quickTagsVirtualScrollRef.current = quickTagsScrollRef.current.scrollLeft;
                                }
                            }}
                        >
                            {[0, 1].map(loopIndex => (
                                QUICK_TAGS.map((tag) => (
                                    <div key={`${loopIndex}-${tag.text}`} className="flex-shrink-0" role="listitem">
                                        <QuickTag
                                            emoji={tag.emoji}
                                            text={tag.text}
                                            onClick={() => setTaskInput(tag.text)}
                                        />
                                    </div>
                                ))
                            ))}
                        </div>
                    </div>

                    {/* Start Button */}
                    <button
                        onClick={handleStartTask}
                        className="w-[247px] h-[46px] bg-gradient-to-t from-[#ffd039] to-[#feb827] border border-[#ffe28a] rounded-[16px] flex items-center justify-center px-12 py-[14px] hover:opacity-90 transition-opacity"
                        style={{ boxShadow: '0 6px 0 0 #D34A22' }}
                    >
                        <span className="text-[13px] leading-[18px] font-bold text-black uppercase tracking-[0.8px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Help me start
                        </span>
                    </button>
                </div>
            </div>

            {/* Bottom Section: How it works */}
            <div className="flex flex-col gap-4">
                {/* Top part: Divider + How it works + Divider (48px gaps) */}
                <div className="flex flex-col gap-12">
                    {/* Divider */}
                    <div className="h-[1px] bg-white/10 w-full" />

                    {/* How it works section */}
                    <div className="flex flex-col gap-6">
                        {/* Title */}
                        <p className="text-center text-[16px] leading-[25.88px] text-[#a5a5a5] capitalize" style={{ fontFamily: 'Sansita, sans-serif' }}>
                            How it works?
                        </p>

                        {/* 3 Items */}
                        <div className="flex flex-col gap-3 w-full px-4 items-center">
                            {/* Item 1: Video camera */}
                            <div className="flex items-center gap-[10px] w-full max-w-[280px]">
                                <Video className="w-6 h-6 text-[#e8eaed] flex-shrink-0" />
                                <span className="text-[16px] leading-[31px] text-[#979797] whitespace-nowrap" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    AI sees what&apos;s distracting you
                                </span>
                            </div>

                            {/* Item 2: Mic */}
                            <div className="flex items-center gap-[10px] w-full max-w-[280px]">
                                <Mic className="w-6 h-6 text-[#e8eaed] flex-shrink-0" />
                                <span className="text-[16px] leading-[31px] text-[#979797] whitespace-nowrap" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    Tell me why you&apos;re avoiding
                                </span>
                            </div>

                            {/* Item 3: Volume */}
                            <div className="flex items-center gap-[10px] w-full max-w-[280px]">
                                <svg className="w-6 h-6 text-[#e8eaed] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                                </svg>
                                <span className="text-[16px] leading-[31px] text-[#979797] whitespace-nowrap" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    AI&apos;ll help you to start
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="h-[1px] bg-white/10 w-full" />
                </div>

                {/* Footer Info (16px gap from divider above) */}
                <div className="flex flex-col gap-4 items-center text-center">
                    <p className="text-[16px] leading-[25.88px] text-[#a5a5a5] capitalize" style={{ fontFamily: 'Sansita, sans-serif' }}>
                        Made With ❤️ For ADHD In SF
                    </p>
                    <p className="text-[10px] leading-[16px] text-[#979797]" style={{ fontFamily: 'Inter, Noto Sans JP, sans-serif' }}>
                        Question or Complain？ Contact: yilun.sun@columbia.edu
                    </p>
                </div>
            </div>
        </div>
    );
}
