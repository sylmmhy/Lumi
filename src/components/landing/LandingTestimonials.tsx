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

// Decorative emoji/icons for visual interest
const decorativeElements = [
    { emoji: '🔥', color: '#FF6B35', top: '10%', left: '15%' },
    { emoji: '⭐', color: '#FFD700', top: '5%', right: '30%' },
    { emoji: '💪', color: '#10B981', top: '15%', right: '10%' },
    { emoji: '🎯', color: '#8B5CF6', bottom: '20%', left: '20%' },
    { emoji: '✨', color: '#F472B6', bottom: '15%', right: '25%' }
];

export const LandingTestimonials: React.FC = () => {
    return (
        <section className="py-20 px-6 bg-white relative overflow-hidden" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {/* Decorative Elements */}
            {decorativeElements.map((el, idx) => (
                <div
                    key={idx}
                    className="absolute text-4xl md:text-5xl opacity-60 animate-pulse"
                    style={{
                        top: el.top,
                        left: el.left,
                        right: el.right,
                        bottom: el.bottom
                    }}
                >
                    {el.emoji}
                </div>
            ))}

            <div className="max-w-6xl mx-auto relative z-10">
                {/* Section Title */}
                <h2 className="text-4xl md:text-5xl font-bold text-center text-gray-900 mb-16">
                    Members are getting more<br />done and feeling great
                </h2>

                {/* Testimonial Cards */}
                <div className="grid md:grid-cols-3 gap-6">
                    {testimonials.map((testimonial, index) => (
                        <div
                            key={index}
                            className="bg-[#FDF6F0] rounded-2xl p-8 flex flex-col justify-between"
                        >
                            <p className="text-lg text-gray-800 font-medium leading-relaxed mb-8">
                                "{testimonial.quote}"
                            </p>
                            <p className="text-sm text-gray-500">
                                {testimonial.context}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
