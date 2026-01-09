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
        bgColor: '#2545BD'
    },
    {
        id: 'awareness',
        tab: 'Smart Insights',
        title: 'I Know What You\'re Avoiding',
        description: "Lumi learns your patterns and gently calls out procrastination before it spirals. No more hiding from that task you've been putting off for weeks.",
        image: Feature2,
        bgColor: '#FF6B35'
    },
    {
        id: 'habits',
        tab: 'Habit Tracking',
        title: 'Set A Habit. AI Will Call You.',
        description: "Habit tracking that actually works. Set your goals, and Lumi will check in with you at the right moments. Finally, a system that won't become a graveyard of good intentions.",
        image: Feature3,
        bgColor: '#2563EB'
    },
    {
        id: 'checkin',
        tab: 'Video Check-In',
        title: 'Quick Video Check-In. Get Started.',
        description: "Like having a supportive friend who never gets tired of you. Quick video sessions to build momentum and get you moving on your tasks.",
        image: Feature4,
        bgColor: '#DC2626'
    },
    {
        id: 'streak',
        tab: 'Progress Tracking',
        title: 'Ready? Let\'s Get Moving.',
        description: "Watch your streaks grow and celebrate your wins. Track your progress with beautiful visualizations that make consistency feel rewarding.",
        image: Feature5,
        bgColor: '#059669'
    }
];

export const LandingFeatures: React.FC = () => {
    const [activeFeature, setActiveFeature] = useState(features[0]);

    return (
        <section className="py-20 px-6 bg-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
            <div className="max-w-6xl mx-auto">
                {/* Section Title */}
                <h2 className="text-4xl md:text-5xl font-bold text-center text-gray-900 mb-4">
                    The productivity app for<br />every procrastinator
                </h2>
                <p className="text-xl text-gray-600 text-center mb-12 max-w-2xl mx-auto">
                    Stop saying "I'll do it tomorrow." Start today with Lumi by your side.
                </p>

                {/* Feature Tabs */}
                <div className="flex flex-wrap justify-center gap-3 mb-12">
                    {features.map((feature) => (
                        <button
                            key={feature.id}
                            onClick={() => setActiveFeature(feature)}
                            className={`px-6 py-3 rounded-full text-base font-semibold transition-all ${
                                activeFeature.id === feature.id
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            {activeFeature.id === feature.id && (
                                <span className="inline-block w-2 h-2 bg-white rounded-full mr-2"></span>
                            )}
                            {feature.tab}
                        </button>
                    ))}
                </div>

                {/* Feature Content */}
                <div
                    className="rounded-3xl overflow-hidden transition-all duration-500"
                    style={{ backgroundColor: activeFeature.bgColor }}
                >
                    <div className="flex flex-col lg:flex-row items-center">
                        {/* Left: Image */}
                        <div className="w-full lg:w-1/2 p-8 lg:p-12 flex justify-center">
                            <img
                                src={activeFeature.image}
                                alt={activeFeature.title}
                                className="max-h-[500px] w-auto object-contain rounded-2xl shadow-2xl transition-all duration-500"
                            />
                        </div>

                        {/* Right: Content */}
                        <div className="w-full lg:w-1/2 p-8 lg:p-12 text-white">
                            <h3 className="text-3xl md:text-4xl font-bold mb-6">
                                {activeFeature.title}
                            </h3>
                            <p className="text-xl opacity-90 mb-8 leading-relaxed">
                                {activeFeature.description}
                            </p>
                            <button className="px-8 py-4 bg-white text-gray-900 font-bold rounded-full hover:bg-gray-100 transition-all">
                                Learn More
                            </button>
                        </div>
                    </div>
                </div>

                {/* Pagination Dots */}
                <div className="flex justify-center gap-2 mt-8">
                    {features.map((feature, index) => (
                        <button
                            key={feature.id}
                            onClick={() => setActiveFeature(feature)}
                            className={`w-3 h-3 rounded-full transition-all ${
                                activeFeature.id === feature.id
                                    ? 'bg-gray-900 w-6'
                                    : 'bg-gray-300 hover:bg-gray-400'
                            }`}
                            aria-label={`Go to feature ${index + 1}`}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
};
