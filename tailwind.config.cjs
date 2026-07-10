/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        game: {
          bg: '#e9dfc8',
          surface: '#f4ecd9',
          border: '#b3a077',
          primary: '#7c2d12',
          secondary: '#713f12',
          accent: '#1e40af',
          gold: '#92600a',
          green: '#3f6212',
          muted: '#8a7a5c',
          text: '#2a2115',
          'text-dim': '#6b5b42',
        },
      },
    },
  },
  plugins: [],
}
