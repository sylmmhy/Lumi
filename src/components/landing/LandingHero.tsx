import React from 'react';

interface LandingHeroProps {
    onGetStarted?: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onGetStarted }) => {
    return (
        <section
            className="relative w-full overflow-hidden pt-16"
            style={{
                fontFamily: 'Nunito, sans-serif',
                background: 'linear-gradient(124deg, #2377E1 0%, #13417B 100%)'
            }}
        >
            {/* Content container - same max-width as other sections */}
            <div className="max-w-6xl mx-auto px-6 relative">
                <div className="flex flex-col lg:flex-row items-center lg:items-start py-16 lg:py-20 gap-8 lg:gap-0">
                    {/* Left: Text content */}
                    <div className="w-full lg:w-1/2 text-center lg:text-left z-10">
                        {/* Main headline */}
                        <h1
                            className="text-white mb-6"
                            style={{
                                fontFamily: 'Nunito, sans-serif',
                                fontWeight: 700,
                                fontSize: 'clamp(32px, 4vw, 48px)',
                                lineHeight: '1.3em',
                                textTransform: 'capitalize'
                            }}
                        >
                            Your Best Year Starts With Your Body Double
                        </h1>

                        {/* Subheadline */}
                        <p
                            className="text-white/90 mb-8"
                            style={{
                                fontFamily: 'Nunito, sans-serif',
                                fontWeight: 500,
                                fontSize: 'clamp(16px, 2vw, 20px)',
                                lineHeight: '1.5em'
                            }}
                        >
                            Procrastination Champion? Can't Stick To Habits For More Than 3 Days? We Got You.
                        </p>

                        {/* CTA Button */}
                        <button
                            onClick={onGetStarted}
                            className="transition-all hover:opacity-90 transform hover:scale-105"
                            style={{
                                fontFamily: 'Nunito, sans-serif',
                                fontWeight: 700,
                                fontSize: '18px',
                                backgroundColor: '#FCD351',
                                color: '#000000',
                                borderRadius: '26px',
                                padding: '14px 28px',
                                textAlign: 'center'
                            }}
                        >
                            Request Beta Test
                        </button>
                    </div>

                    {/* Right: Phone mockup */}
                    <div className="w-full lg:w-1/2 relative flex justify-center lg:justify-end">
                        {/* Orange ellipse background */}
                        <div
                            className="absolute rounded-full"
                            style={{
                                width: 'clamp(280px, 35vw, 380px)',
                                height: 'clamp(280px, 35vw, 380px)',
                                backgroundColor: '#FFC676',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-30%, -45%)'
                            }}
                        />

                        {/* Phone image */}
                        <img
                            src="/hero-phones.png"
                            alt="Lumi App"
                            className="relative z-10 w-[280px] lg:w-[400px] h-auto object-contain"
                        />
                    </div>
                </div>
            </div>
        </section>
    );
};
