import React from 'react';

interface LandingHeroProps {
    onGetStarted?: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onGetStarted }) => {
    return (
        <section
            className="relative w-full overflow-hidden px-6"
            style={{
                fontFamily: 'Nunito, sans-serif',
                background: 'radial-gradient(circle at top right, #FFFFFF 0%, #F5F7FA 100%)',
                minHeight: '80vh',
                display: 'flex',
                alignItems: 'center'
            }}
        >
            {/* Content container */}
            <div className="max-w-6xl mx-auto relative w-full" style={{ zIndex: 10 }}>
                <div className="flex flex-col lg:flex-row items-center justify-between pt-12 pb-24">
                    {/* Left side: Typography + CTA */}
                    <div className="w-full lg:w-[55%] z-10 text-left">
                        {/* Super Heading */}
                        <h1
                            className="text-gray-900"
                            style={{
                                fontWeight: 900,
                                fontSize: '64px',
                                lineHeight: '1.1em',
                                letterSpacing: '-0.04em',
                                marginBottom: '40px'
                            }}
                        >
                            <span className="block opacity-40 text-sm font-bold uppercase tracking-widest mb-4">Introducing Lumi</span>
                            Procrastination<br />
                            is now <span style={{ color: '#2545BD' }}>optional.</span>
                        </h1>

                        <p className="text-xl text-gray-500 mb-10 max-w-lg leading-relaxed font-medium">
                            Meet your AI body double. Real-time accountability
                            that actually sticks, so you can focus on what matters.
                        </p>

                        {/* CTA Button */}
                        <button
                            onClick={onGetStarted}
                            className="transition-all hover:opacity-90 transform hover:scale-105 active:scale-95"
                            style={{
                                fontWeight: 700,
                                fontSize: '18px',
                                backgroundColor: '#2545BD',
                                color: '#FFFFFF',
                                borderRadius: '9999px',
                                padding: '20px 48px',
                                textAlign: 'center',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'inline-block',
                                boxShadow: '0 20px 40px rgba(37, 69, 189, 0.2)'
                            }}
                        >
                            Request Beta Test
                        </button>
                    </div>

                    {/* Right side: Phone mockup with refined circles */}
                    <div className="w-full lg:w-[45%] relative flex justify-center lg:justify-end mt-16 lg:mt-0">
                        <div className="relative">
                            {/* Refined Blue circle */}
                            <div
                                className="absolute rounded-full hidden lg:block"
                                style={{
                                    width: '420px',
                                    height: '420px',
                                    backgroundColor: '#2545BD',
                                    left: '60%',
                                    top: '50%',
                                    transform: 'translate(-15%, -50%)',
                                    zIndex: 1,
                                    opacity: 0.9,
                                    filter: 'blur(1px)'
                                }}
                            />
                            {/* Phone mockup */}
                            <img
                                src="/hero-phones.png"
                                alt="Lumi App"
                                style={{
                                    width: '520px',
                                    height: 'auto',
                                    objectFit: 'contain',
                                    position: 'relative',
                                    zIndex: 3,
                                    borderRadius: '24px'
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Background decorative gradient */}
            <div
                className="absolute top-0 right-0 w-1/2 h-full hidden lg:block"
                style={{
                    background: 'radial-gradient(circle at 70% 30%, rgba(37, 69, 189, 0.03) 0%, transparent 70%)',
                    zIndex: 0
                }}
            />
        </section>
    );
};
