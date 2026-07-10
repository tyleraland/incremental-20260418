/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        game: {
          bg: '#0f0b08',
          surface: '#1a140e',
          border: '#3d2f1f',
          primary: '#d97706',
          secondary: '#b45309',
          accent: '#e7c07a',
          gold: '#f59e0b',
          green: '#65a30d',
          muted: '#6b5d48',
          text: '#efe6d5',
          'text-dim': '#a89878',
        },
      },
    },
  },
  plugins: [],
}
