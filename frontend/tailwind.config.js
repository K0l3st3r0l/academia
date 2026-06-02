/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6C3CE1',
          dark: '#4A1FA8',
          light: '#9B6FF0',
        },
        gold: '#F5C842',
        correct: '#22C55E',
        wrong: '#EF4444',
        surface: '#1A1A2E',
        card: '#16213E',
      },
      fontFamily: {
        game: ['"Nunito"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
