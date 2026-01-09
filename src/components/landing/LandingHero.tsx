import React from 'react';

interface LandingHeroProps {
    onGetStarted?: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onGetStarted }) => {
    return (
        <section
            className="relative w-full overflow-hidden"
            style={{
                fontFamily: 'Nunito, sans-serif',
                backgroundColor: '#F8F8F8',
                minHeight: '600px'
            }}
        >
            {/* Blue circle - large, extends beyond right edge */}
            <div
                className="absolute rounded-full hidden lg:block"
                style={{
                    width: '400px',
                    height: '400px',
                    backgroundColor: '#2545BD',
                    right: '350px',
                    top: '180px',
                    zIndex: 1
                }}
            />

            {/* Content container */}
            <div className="max-w-6xl mx-auto px-6 lg:px-12 relative" style={{ zIndex: 10 }}>
                <div className="flex flex-col lg:flex-row items-center lg:items-start pt-24 lg:pt-28 pb-16">
                    {/* Left side: Branding + Description + CTA */}
                    <div className="w-full lg:w-[45%] z-10">
                        {/* Logo + Title image */}
                        <img
                            src="/lumi-logo-title.png"
                            alt="LUMI - Your Body Double."
                            className="mb-10"
                            style={{
                                height: '90px',
                                width: 'auto',
                                objectFit: 'contain'
                            }}
                        />

                        {/* Description text */}
                        <p
                            className="mb-10 text-gray-800"
                            style={{
                                fontWeight: 500,
                                fontSize: '20px',
                                lineHeight: '1.6em',
                                maxWidth: '420px'
                            }}
                        >
                            Procrastination Champion? Can't Stick To Habits For More Than 3 Days? We Got You.
                        </p>

                        {/* CTA Button */}
                        <button
                            onClick={onGetStarted}
                            className="transition-all hover:opacity-90 transform hover:scale-105"
                            style={{
                                fontWeight: 700,
                                fontSize: '16px',
                                lineHeight: '1.5em',
                                backgroundColor: '#2545BD',
                                color: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '16px 32px',
                                textAlign: 'center',
                                border: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            Request Beta Test
                        </button>
                    </div>

                    {/* Right side: Phone mockup with orange circle */}
                    <div className="w-full lg:w-[55%] relative flex justify-center lg:justify-end mt-12 lg:mt-0">
                        <div className="relative">

                            {/* Phone mockup */}
                            <img
                                src="/hero-phones.png"
                                alt="Lumi App"
                                style={{
                                    width: '500px',
                                    height: 'auto',
                                    objectFit: 'contain',
                                    position: 'relative',
                                    zIndex: 3
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile circles */}
            <div
                className="absolute rounded-full lg:hidden"
                style={{
                    width: '300px',
                    height: '300px',
                    backgroundColor: '#2545BD',
                    right: '-80px',
                    top: '200px',
                    zIndex: 0
                }}
            />

        </section>
    );
};
