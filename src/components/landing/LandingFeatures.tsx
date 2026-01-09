import React, { useState } from 'react';
import Feature1 from '../../assets/1.png';
import Feature2 from '../../assets/2.png';
import Feature3 from '../../assets/3.png';
import Feature4 from '../../assets/4.png';
import Feature5 from '../../assets/5.png';

interface Feature {
    id: string;
    tab: string;
    title: string;
    description: string;
    image: string;
    bgColor: string;
}

const features: Feature[] = [
    {
        id: 'body-double',
        tab: 'AI Companion',
        title: 'Meet Lumi, Your Body Double',
        description: "An AI coach who's as persistent as your mom, but way less judgmental. Lumi stays with you through tasks, providing the accountability you need without the guilt trips.",
        image: Feature1,
        bgColor: '#E6EFFF'
    },
    {
        id: 'awareness',
        tab: 'Smart Insights',
        title: 'I Know What You\'re Avoiding',
        description: "Lumi learns your patterns and gently calls out procrastination before it spirals. No more hiding from that task you've been putting off for weeks.",
        image: Feature2,
        bgColor: '#FFF2E6'
    },
    {
        id: 'habits',
        tab: 'Habit Tracking',
        title: 'Set A Habit. AI Will Call You.',
        description: "Habit tracking that actually works. Set your goals, and Lumi will check in with you at the right moments. Finally, a system that won't become a graveyard of good intentions.",
        image: Feature3,
        bgColor: '#EBF5FF'
    },
    {
        id: 'checkin',
        tab: 'Video Check-In',
        title: 'Quick Video Check-In. Get Started.',
        description: "Like having a supportive friend who never gets tired of you. Quick video sessions to build momentum and get you moving on your tasks.",
        image: Feature4,
        bgColor: '#FEEBED'
    },
    {
        id: 'streak',
        tab: 'Progress Tracking',
        title: 'Ready? Let\'s Get Moving.',
        description: "Watch your streaks grow and celebrate your wins. Track your progress with beautiful visualizations that make consistency feel rewarding.",
        image: Feature5,
        bgColor: '#ECFDF5'
    }
];

export const LandingFeatures: React.FC = () => {
    const [activeTab, setActiveTab] = useState(features[0].id);
    const activeFeature = features.find(f => f.id === activeTab) || features[0];

    return (
        <section className="py-24 px-6 bg-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
            <div className="max-w-6xl mx-auto">
                {/* Tabs Navigation */}
                <div className="flex flex-wrap justify-center gap-4 mb-20">
                    {features.map((feature) => (
                        <button
                            key={feature.id}
                            onClick={() => setActiveTab(feature.id)}
                            className={`px-8 py-3 rounded-full text-base font-bold transition-all duration-300 ${activeTab === feature.id
                                    ? 'bg-[#2545BD] text-white shadow-xl transform scale-105'
                                    : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                }`}
                        >
                            {feature.tab}
                        </button>
                    ))}
                </div>

                {/* Feature Content Box */}
                <div
                    className="rounded-[40px] overflow-hidden transition-all duration-700 ease-in-out border border-black/5"
                    style={{
                        background: `linear-gradient(135deg, ${activeFeature.bgColor} 0%, #FFFFFF 100%)`,
                        boxShadow: '0 40px 100px -20px rgba(0,0,0,0.05)'
                    }}
                >
                    <div className="flex flex-col lg:flex-row items-center min-h-[550px]">
                        {/* Left: Image Side */}
                        <div className="w-full lg:w-1/2 p-8 lg:p-16 flex justify-center items-center">
                            <div className="relative">
                                {/* Soft Glow behind image */}
                                <div
                                    className="absolute -inset-10 rounded-full blur-3xl opacity-20 transition-all duration-700"
                                    style={{ backgroundColor: activeFeature.bgColor }}
                                />
                                <img
                                    src={activeFeature.image}
                                    alt={activeFeature.title}
                                    className="max-h-[520px] w-auto object-contain relative z-10 transition-all duration-700"
                                    style={{
                                        borderRadius: '24px',
                                        filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.08))'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Right: Text Side */}
                        <div className="w-full lg:w-1/2 p-8 lg:p-16">
                            <h3
                                className="text-4xl md:text-5xl font-black mb-8 tracking-tight text-gray-900 leading-tight"
                            >
                                {activeFeature.title}
                            </h3>
                            <p className="text-xl text-gray-500 font-medium leading-relaxed mb-10 max-w-md">
                                {activeFeature.description}
                            </p>

                            {/* Premium Feature Points */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-[#2545BD]/10 flex items-center justify-center">
                                        <div className="w-2 h-2 rounded-full bg-[#2545BD]" />
                                    </div>
                                    <span className="text-gray-700 font-bold">Scientifically proven method</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-[#2545BD]/10 flex items-center justify-center">
                                        <div className="w-2 h-2 rounded-full bg-[#2545BD]" />
                                    </div>
                                    <span className="text-gray-700 font-bold">No-judgment accountability</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
