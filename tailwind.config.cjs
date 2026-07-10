/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        game: {
          bg: '#030904',
          surface: '#07130a',
          border: '#1d4022',
          primary: '#22c55e',
          secondary: '#15803d',
          accent: '#86efac',
          gold: '#eab308',
          green: '#4ade80',
          muted: '#3f6947',
          text: '#bbf7d0',
          'text-dim': '#5fa870',
        },
      },
    },
  },
  plugins: [],
}
