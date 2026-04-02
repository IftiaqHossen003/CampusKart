/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1E3A5F',
        accent: '#2E86AB',
        success: '#22C55E',
        warning: '#EAB308',
        error: '#EF4444',
        text: '#1F2937',
        muted: '#6B7280',
        bg: '#F9FAFB',
      },
    },
  },
  plugins: [],
}