/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        game: {
          bg: '#05070d',
          surface: '#0c1220',
          border: '#263752',
          primary: '#0ea5e9',
          secondary: '#6366f1',
          accent: '#22d3ee',
          gold: '#fbbf24',
          green: '#34d399',
          muted: '#526073',
          text: '#f1f5f9',
          'text-dim': '#9fb3c8',
        },
      },
    },
  },
  plugins: [],
}
