import React from 'react';
import Feature1 from '../../assets/1.png';
import Feature4 from '../../assets/4.png';
import Feature5 from '../../assets/5.png';

interface LandingCTAProps {
    onGetStarted?: () => void;
}

export const LandingCTA: React.FC<LandingCTAProps> = ({ onGetStarted }) => {
    return (
        <section className="py-12 px-6 bg-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
            <div className="max-w-6xl mx-auto">
                <div
                    className="rounded-3xl overflow-hidden relative"
                    style={{ backgroundColor: '#2545BD' }}
                >
                    {/* Background decorative elements */}
                    <div className="absolute top-8 left-1/2 transform -translate-x-1/2">
                        <span className="text-pink-400 text-2xl">✕</span>
                    </div>
                    <div className="absolute top-16 right-1/3">
                        <span className="text-yellow-400 text-3xl">◆</span>
                    </div>

                    <div className="flex flex-col lg:flex-row items-center p-8 lg:p-16">
                        {/* Left: Content */}
                        <div className="w-full lg:w-1/2 text-white mb-8 lg:mb-0">
                            <h2 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
                                Join thousands who've<br />
                                stopped procrastinating
                            </h2>
                            <p className="text-lg opacity-90 mb-8">
                                Start your journey with Lumi today. Get personalized AI coaching, habit tracking, and accountability that actually works.
                            </p>
                            <div className="flex flex-wrap gap-4">
                                <button
                                    onClick={onGetStarted}
                                    className="px-8 py-4 bg-white text-gray-900 font-bold rounded-full hover:bg-gray-100 transition-all"
                                >
                                    Request Beta Access
                                </button>
                                <button className="px-8 py-4 bg-transparent border-2 border-white text-white font-bold rounded-full hover:bg-white/10 transition-all">
                                    Learn More
                                </button>
                            </div>
                        </div>

                        {/* Right: Images */}
                        <div className="w-full lg:w-1/2 relative flex justify-center items-center">
                            <div className="relative">
                                {/* Main image */}
                                <img
                                    src={Feature1}
                                    alt="Lumi App"
                                    className="w-48 md:w-56 rounded-2xl shadow-xl z-10 relative"
                                />
                                {/* Secondary images */}
                                <img
                                    src={Feature4}
                                    alt="Video Check-in"
                                    className="absolute -top-4 -right-16 w-32 md:w-40 rounded-xl shadow-lg transform rotate-6"
                                />
                                <img
                                    src={Feature5}
                                    alt="Progress Tracking"
                                    className="absolute -bottom-4 -left-16 w-32 md:w-40 rounded-xl shadow-lg transform -rotate-6"
                                />
                            </div>
                            {/* Decorative cloud */}
                            <div className="absolute bottom-0 right-0 text-6xl opacity-50">
                                ☁️
                            </div>
                        </div>
                    </div>
                </div>

                {/* Scrolling text banner */}
                <div className="mt-8 py-4 border-t border-b border-gray-200 overflow-hidden">
                    <div className="flex animate-scroll whitespace-nowrap">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="flex items-center gap-8 mx-8">
                                <span className="text-gray-400">●</span>
                                <span className="text-xl font-semibold text-gray-700">get things done</span>
                                <span className="text-gray-400">◡◡</span>
                                <span className="text-xl font-semibold text-gray-700">build lasting habits</span>
                                <span className="text-gray-400">●●</span>
                                <span className="text-xl font-semibold text-gray-700">beat procrastination</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};
