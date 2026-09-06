/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        game: {
          bg: '#0a0a0f',
          surface: '#12121a',
          border: '#2a2a3a',
          primary: '#6366f1',
          secondary: '#8b5cf6',
          accent: '#22d3ee',
          gold: '#f59e0b',
          green: '#10b981',
          muted: '#4b5563',
          text: '#e2e8f0',
          'text-dim': '#94a3b8',
        },
      },
    },
  },
  plugins: [],
}
