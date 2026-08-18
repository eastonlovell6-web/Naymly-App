/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#F6F5F2',
        'background-alt': '#F7EED4',
        'accent-mint': '#D6F0E4',
        'accent-gold': '#E7D397',
        neutral: '#C0BDB7',
        ink: '#000000',
        surface: '#FFFFFF',
      },
    },
  },
  plugins: [],
};
