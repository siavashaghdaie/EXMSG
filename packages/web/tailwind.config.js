/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'glow-pulse': 'glow-pulse 2.5s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': {
            boxShadow: '0 0 4px 0px rgba(59, 130, 246, 0.3), inset 0 0 4px 0px rgba(59, 130, 246, 0.05)',
            backgroundColor: 'rgba(59, 130, 246, 0.03)',
          },
          '50%': {
            boxShadow: '0 0 12px 2px rgba(59, 130, 246, 0.5), inset 0 0 8px 0px rgba(59, 130, 246, 0.1)',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
          },
        },
      },
    },
  },
  plugins: [],
};
