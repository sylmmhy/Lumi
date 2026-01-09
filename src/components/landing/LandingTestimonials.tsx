import React from 'react';

interface Testimonial {
    quote: string;
    context: string;
}

const testimonials: Testimonial[] = [
    {
        quote: "I finally finished my side project after 6 months of procrastinating. Lumi's gentle nudges kept me accountable without making me feel guilty.",
        context: "Member on beating procrastination"
    },
    {
        quote: "The body double feature is a game changer. It's like having a study buddy who's always available, never judgmental, and actually helps me focus.",
        context: "Member on staying focused"
    },
    {
        quote: "I've tried every habit app out there. Lumi is the first one where my habits actually stuck past the 3-day mark. Now I'm on a 45-day streak!",
        context: "Member on building habits"
    }
];

export const LandingTestimonials: React.FC = () => {
    return (
        <section
            className="py-24 px-6 relative overflow-hidden"
            style={{
                fontFamily: 'Nunito, sans-serif',
                background: 'linear-gradient(to bottom, #FFFFFF 0%, #FAFBFC 100%)'
            }}
        >
            {/* Subtle Dot Pattern for texture */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#2545BD 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

            <div className="max-w-6xl mx-auto relative z-10">
                {/* Section Title */}
                <div className="text-center mb-20">
                    <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-6 tracking-tight">
                        Members are getting more<br />done and feeling great
                    </h2>
                    <div className="w-20 h-1.5 bg-[#2545BD] mx-auto rounded-full opacity-20" />
                </div>

                {/* Testimonial Cards */}
                <div className="grid md:grid-cols-3 gap-8">
                    {testimonials.map((testimonial, index) => (
                        <div
                            key={index}
                            className="bg-white border border-gray-100 rounded-[32px] p-10 flex flex-col justify-between transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.04)] group"
                        >
                            <div className="mb-10">
                                <span className="text-6xl text-[#2545BD] opacity-10 font-serif leading-none block mb-[-20px]">“</span>
                                <p className="text-xl text-gray-700 font-medium leading-relaxed relative z-10">
                                    {testimonial.quote}
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-[#2545BD]/10 transition-colors" />
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                                    {testimonial.context}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

