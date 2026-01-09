import React from 'react';
import LumiSparkle from '../../assets/Lumi-happy.png';

interface LandingCTAProps {
    onGetStarted?: () => void;
}

export const LandingCTA: React.FC<LandingCTAProps> = ({ onGetStarted }) => {
    return (
        <section className="py-24 px-6 bg-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
            <div className="max-w-6xl mx-auto">
                <div
                    className="rounded-[48px] overflow-hidden relative"
                    style={{
                        backgroundColor: '#2545BD',
                        boxShadow: '0 40px 80px -15px rgba(37, 69, 189, 0.4)'
                    }}
                >
                    {/* Abstract Decorative Shapes (Reference Inspired) */}
                    <div className="absolute top-[-50px] left-[-50px] w-64 h-64 rounded-full bg-blue-400/20 blur-3xl" />
                    <div className="absolute bottom-[-100px] right-[-100px] w-96 h-96 rounded-full bg-blue-800/40 blur-3xl opacity-50" />

                    {/* Orange Zigzag Decoration */}
                    <div className="absolute top-12 right-24 w-32 h-32 opacity-20 rotate-12 hidden lg:block">
                        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M10 50L30 30L50 50L70 30L90 50" stroke="#FE8D00" strokeWidth="12" strokeLinecap="round" />
                        </svg>
                    </div>

                    <div className="flex flex-col lg:flex-row items-center p-10 lg:p-20 relative z-10 text-center lg:text-left">
                        {/* Left: Content */}
                        <div className="w-full lg:w-3/5 text-white mb-16 lg:mb-0">
                            <h2 className="text-4xl md:text-6xl font-black mb-8 leading-[1.1] tracking-tight">
                                Join thousands who've<br />
                                <span style={{ color: '#FE8D00' }}>stopped</span> procrastinating
                            </h2>
                            <p className="text-xl opacity-90 mb-10 max-w-lg mx-auto lg:mx-0 font-medium leading-relaxed">
                                Start your journey with Lumi today. Get personalized AI coaching, habit tracking, and accountability that actually works.
                            </p>
                            <div className="flex flex-wrap justify-center lg:justify-start gap-4">
                                <button
                                    onClick={onGetStarted}
                                    className="px-10 py-5 bg-white text-[#2545BD] font-black text-lg rounded-full hover:bg-gray-50 transition-all shadow-xl hover:scale-105 active:scale-95"
                                >
                                    Request Beta Access
                                </button>
                            </div>
                        </div>

                        {/* Right: Premium Mascot Display */}
                        <div className="w-full lg:w-2/5 relative flex justify-center items-center h-[400px]">
                            <style>{`
                                @keyframes lumi-float {
                                    0% { transform: translateY(0px) scale(1); }
                                    50% { transform: translateY(-20px) scale(1.02); }
                                    100% { transform: translateY(0px) scale(1); }
                                }
                                @keyframes glow-pulse {
                                    0% { opacity: 0.4; transform: scale(1); }
                                    50% { opacity: 0.7; transform: scale(1.2); }
                                    100% { opacity: 0.4; transform: scale(1); }
                                }
                                .animate-lumi { animation: lumi-float 8s ease-in-out infinite; }
                                .animate-glow { animation: glow-pulse 10s ease-in-out infinite; }
                            `}</style>

                            <div className="relative">
                                {/* Multi-layered Glow Base */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-orange-500 rounded-full blur-[100px] opacity-20 animate-glow" />
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180px] h-[180px] bg-orange-400 rounded-full blur-[60px] opacity-30 animate-glow" style={{ animationDelay: '-5s' }} />

                                {/* The High-Res Mascot */}
                                <img
                                    src={LumiSparkle}
                                    alt="Lumi Mascot"
                                    className="w-64 md:w-80 z-20 relative animate-lumi"
                                    style={{ filter: 'drop-shadow(0 20px 50px rgba(254, 141, 0, 0.3))' }}
                                />

                                {/* Orbiting Dots (Vitality elements) */}
                                <div className="absolute top-0 right-0 w-3 h-3 bg-orange-300 rounded-full animate-ping opacity-60" />
                                <div className="absolute bottom-10 left-0 w-2 h-2 bg-blue-300 rounded-full animate-pulse opacity-40" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Refined Scrolling text banner */}
                <div className="mt-16 py-6 border-t border-b border-gray-100 overflow-hidden">
                    <div className="flex animate-scroll whitespace-nowrap opacity-30">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="flex items-center gap-12 mx-12">
                                <span className="text-gray-400">●</span>
                                <span className="text-xl font-bold text-gray-900 uppercase tracking-[0.2em] italic">Get things done</span>
                                <span className="text-gray-400">●</span>
                                <span className="text-xl font-bold text-gray-900 uppercase tracking-[0.2em] italic">Build habits</span>
                                <span className="text-gray-400">●</span>
                                <span className="text-xl font-bold text-gray-900 uppercase tracking-[0.2em] italic">Beat procrastination</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};
