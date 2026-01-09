import React from 'react';

interface LandingHeroProps {
    onGetStarted?: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onGetStarted }) => {
    return (
        <section
            className="relative w-full overflow-hidden pt-16"
            style={{ backgroundColor: '#EDEDED', fontFamily: 'Nunito, sans-serif', minHeight: '600px' }}
        >
            {/* Right side background image */}
            <div
                className="absolute right-0 top-0 h-full hidden lg:block"
                style={{ width: '50%' }}
            >
                <img
                    src="/landing-hero-bg.png"
                    alt=""
                    className="w-full h-full object-cover object-left"
                />
            </div>

            {/* Left side content */}
            <div
                className="relative z-10 flex flex-col justify-center px-6 lg:px-0"
                style={{
                    paddingLeft: 'max(24px, calc((100vw - 1200px) / 2 + 80px))',
                    paddingTop: '80px',
                    paddingBottom: '80px',
                    maxWidth: '600px',
                    gap: '24px'
                }}
            >
                {/* Logo */}
                <img
                    src="/landing-logo.png"
                    alt="Lumi"
                    className="w-full max-w-[380px]"
                />

                {/* Tagline */}
                <h1
                    className="text-black leading-relaxed"
                    style={{
                        fontFamily: 'Nunito, sans-serif',
                        fontWeight: 500,
                        fontSize: '22px',
                        lineHeight: '1.5em'
                    }}
                >
                    Procrastination Champion? Can't Stick To Habits For More Than 3 Days? We Got You.
                </h1>

                {/* CTA Button */}
                <button
                    onClick={onGetStarted}
                    className="text-white transition-all hover:opacity-90 transform hover:scale-105"
                    style={{
                        fontFamily: 'Nunito, sans-serif',
                        fontWeight: 700,
                        fontSize: '20px',
                        lineHeight: '1.85em',
                        backgroundColor: '#2545BD',
                        borderRadius: '26px',
                        padding: '10px 24px',
                        width: 'fit-content',
                        textAlign: 'center'
                    }}
                >
                    Request Beta Test
                </button>
            </div>
        </section>
    );
};
