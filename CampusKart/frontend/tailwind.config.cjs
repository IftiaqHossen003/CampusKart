/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#111111',
        accent: '#C8FF2F',
        success: '#22C55E',
        warning: '#EAB308',
        error: '#FF5F5F',
        text: '#FFFFFF',
        muted: '#D9D9D9',
        bg: '#7A7470',
        slate: {
          50: '#111111',
          100: '#1C1C1C',
          200: '#262626',
          300: '#3A3A3A',
          400: '#A7A7A7',
          500: '#BDBDBD',
          600: '#D9D9D9',
          700: '#E5E5E5',
          800: '#F2F2F2',
          900: '#FFFFFF',
        },
      },
    },
  },
  plugins: [],
}
