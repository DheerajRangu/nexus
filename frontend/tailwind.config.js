/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#f4f6f8',
          900: '#ffffff',
          800: '#f8fafc',
          700: '#e2e8f0',
          600: '#cbd5e1',
        },
        teal: {
          400: '#0f766e',
          500: '#0d9488',
          600: '#0f766e',
        },
        emerald: {
          400: '#047857',
          500: '#059669',
          600: '#047857',
        }
      }
    },
  },
  plugins: [],
}
