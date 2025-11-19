/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'fadeIn': 'fadeIn 0.5s ease-out',
        'morphShape': 'morphShape 20s ease-in-out infinite',
        'pulseGlow': 'pulseGlow 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        morphShape: {
          '0%': { borderRadius: '60% 40% 30% 70%/60% 30% 70% 40%' },
          '50%': { borderRadius: '30% 60% 70% 40%/50% 60% 30% 60%' },
          '100%': { borderRadius: '60% 40% 30% 70%/60% 30% 70% 40%' },
        },
        pulseGlow: {
          '0%': { boxShadow: '0 0 20px rgba(0, 255, 255, 0.2)' },
          '50%': { boxShadow: '0 0 30px rgba(0, 255, 255, 0.4)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 255, 255, 0.2)' },
        },
      },
      colors: {
        'neon-cyan': 'var(--neon-cyan)',
        'dark-bg': 'var(--dark-bg)',
        'darker-bg': 'var(--darker-bg)',
        'gradient-start': 'var(--gradient-start)',
        'gradient-end': 'var(--gradient-end)',
        'accent-blue': 'var(--accent-blue)',
        'accent-purple': 'var(--accent-purple)',
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
}
