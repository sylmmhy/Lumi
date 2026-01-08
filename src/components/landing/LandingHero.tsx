import React from 'react';
import PhoneMockup from '../../assets/Frame 2087327543.png';
import LumiIcon from '../../assets/Lumi-happy.png';

interface LandingHeroProps {
    onGetStarted?: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onGetStarted }) => {
    return (
        <section className="relative min-h-screen overflow-hidden" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {/* Background: Left gray, Right blue */}
            <div className="absolute inset-0 flex">
                <div className="w-1/2 bg-gray-100"></div>
                <div className="w-1/2 bg-[#3B5998]"></div>
            </div>

            {/* Content */}
            <div className="relative z-10 container mx-auto px-6 lg:px-12 py-16 lg:py-24 flex flex-col lg:flex-row items-center justify-between min-h-screen">
                {/* Left side: Text content */}
                <div className="w-full lg:w-1/2 mb-12 lg:mb-0 z-20">
                    {/* Logo and brand */}
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-16 h-16 rounded-2xl bg-[#3B5998] flex items-center justify-center shadow-lg overflow-hidden p-2">
                            <img src={LumiIcon} alt="Lumi" className="w-full h-full object-contain" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-extrabold text-[#3B5998] tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
                                LUMI
                            </h1>
                            <p className="text-xl font-bold text-[#3B5998]" style={{ fontFamily: 'Nunito, sans-serif' }}>
                                Your Body Double.
                            </p>
                        </div>
                    </div>

                    {/* Tagline */}
                    <h2 className="text-2xl lg:text-3xl font-semibold text-gray-800 leading-relaxed mb-10" style={{ fontFamily: 'Nunito, sans-serif' }}>
                        Procrastination Champion? Can't Stick To Habits For <br className="hidden lg:block" />
                        More Than 3 Days? We Got You.
                    </h2>

                    {/* CTA Button */}
                    <button
                        onClick={onGetStarted}
                        className="px-8 py-4 bg-[#3B5998] hover:bg-[#2d4373] text-white font-bold rounded-full text-lg transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
                        style={{ fontFamily: 'Nunito, sans-serif' }}
                    >
                        Request Beta Test
                    </button>
                </div>

                {/* Right side: Phone mockup - the image already has the orange circle and blue background */}
                <div className="w-full lg:w-1/2 relative flex justify-center lg:justify-end items-center">
                    <img
                        src={PhoneMockup}
                        alt="Lumi App Preview"
                        className="relative z-10 max-w-[400px] lg:max-w-[550px] w-full h-auto object-contain"
                    />
                </div>
            </div>
        </section>
    );
};
