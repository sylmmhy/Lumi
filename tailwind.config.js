/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#D9532F',
          darkOrange: '#C9302C',
          blue: '#446BF2',
          darkBlue: '#2C46B5',
          yellow: '#F4F8B6',
          lime: '#DFFF4F',
          cream: '#FEF9EB',
          text: '#2D2D2D',
          gray: '#E5E5E5',
          greenText: '#4A6741',
          goldBorder: '#E6C865',
          lightGreen: '#EFFFD6',
          darkGreen: '#3E7B58',
          goldBadge: '#F4C430',
          heatmapGold: '#E6C865',
          heatmapBlue: '#AECBFA',
          heatmapPink: '#E6C8C8',
          heatmapEmpty: '#F0F0F0',
        },
        gh: {
          0: '#ebedf0',
          1: '#9be9a8',
          2: '#40c463',
          3: '#30a14e',
          4: '#216e39',
        },
      },
      fontFamily: {
        playfair: ['Playfair Display', 'serif'],
        inter: ['Inter', 'sans-serif'],
        serif: ['"DM Serif Display"', 'serif'],
        sans: ['"Quicksand"', 'system-ui', 'sans-serif'],
        hand: ['"Caveat"', 'cursive'],
        sansita: ['"Sansita"', 'sans-serif'],
        'sansita-one': ['"Sansita One"', 'sans-serif'],
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        glow: 'glow 2s ease-in-out infinite alternate',
        'fade-in': 'fade-in 0.3s ease-out both',
        'fade-in-up': 'fade-in-up 0.35s ease-out both',
        'slide-up': 'slide-up 0.35s ease-out both',
        'scale-in': 'scale-in 0.35s ease-out both',
        'pop-in': 'pop-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
        shake: 'shake 0.5s ease-in-out infinite',
      },
      boxShadow: {
        soft: '0 4px 20px rgba(0, 0, 0, 0.05)',
        button: '0 4px 10px rgba(68, 107, 242, 0.3)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        glow: {
          from: { textShadow: '0 0 5px rgba(255,255,255,0.3)' },
          to: { textShadow: '0 0 20px rgba(255,255,255,0.6), 0 0 30px rgba(255,255,255,0.4)' },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        'fade-in-up': {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: 0, transform: 'translateY(20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: 0, transform: 'scale(0.96)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
        'pop-in': {
          '0%': { opacity: 0, transform: 'scale(0.5)' },
          '70%': { transform: 'scale(1.1)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
        shake: {
          '0%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(5deg)' },
          '50%': { transform: 'rotate(0deg)' },
          '75%': { transform: 'rotate(-5deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
      },
    },
  },
  plugins: [],
}
