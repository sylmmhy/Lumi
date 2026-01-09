import React from 'react';

interface LandingHeroProps {
    onGetStarted?: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onGetStarted }) => {
    return (
        <section
            className="relative w-full min-h-screen overflow-hidden"
            style={{ backgroundColor: '#EDEDED', fontFamily: 'Nunito, sans-serif' }}
        >
            {/* Right side background image */}
            <div
                className="absolute right-0 top-0 h-full"
                style={{ width: '55%' }}
            >
                <img
                    src="/landing-hero-bg.png"
                    alt=""
                    className="w-full h-full object-cover object-left"
                />
            </div>

            {/* Left side content */}
            <div
                className="relative z-10 flex flex-col justify-center min-h-screen"
                style={{
                    paddingLeft: '80px',
                    paddingTop: '120px',
                    paddingBottom: '120px',
                    maxWidth: '650px',
                    gap: '32px'
                }}
            >
                {/* Logo */}
                <img
                    src="/landing-logo.png"
                    alt="Lumi"
                    style={{
                        width: '462px',
                        height: 'auto',
                        maxWidth: '100%'
                    }}
                />

                {/* Tagline */}
                <h1
                    className="text-black leading-relaxed"
                    style={{
                        fontFamily: 'Nunito, sans-serif',
                        fontWeight: 500,
                        fontSize: '25px',
                        lineHeight: '1.44em',
                        textTransform: 'capitalize'
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
                        fontSize: '25px',
                        lineHeight: '1.85em',
                        backgroundColor: '#2545BD',
                        borderRadius: '26px',
                        padding: '12px 16px',
                        width: '271px',
                        textAlign: 'center'
                    }}
                >
                    Request Beta Test
                </button>
            </div>
        </section>
    );
};
