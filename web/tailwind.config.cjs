module.exports = {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d1117',
        panel: '#11161d',
        border: '#232a34',
        muted: '#8b949e',
        accent: '#6ea8fe',
        accent2: '#3fb950',
        danger: '#f85149',
        warn: '#d29922',
      },
      keyframes: {
        pulse2: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
        enter: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: {
        pulse2: 'pulse2 1.2s ease-in-out infinite',
        enter: 'enter 180ms ease-out both',
      },
    },
  },
  plugins: [],
};
