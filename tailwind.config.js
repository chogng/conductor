/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      scale: {
        102: '1.02',
        103: '1.03',
      },
      transitionDuration: {
        1250: '1250ms',
      },
      colors: {
        bg: {
          page: 'rgb(var(--bg-page) / <alpha-value>)',
          surface: 'rgb(var(--bg-surface) / <alpha-value>)',
          'surface-hover': 'rgb(var(--bg-surface-hover) / <alpha-value>)',
          ghost: 'rgb(var(--bg-ghost) / <alpha-value>)',
          primary: 'rgb(var(--bg-primary) / <alpha-value>)',
          subtle: 'rgb(var(--bg-subtle) / <alpha-value>)',
          0: 'rgb(var(--bg-0) / <alpha-value>)',
          100: 'rgb(var(--bg-100) / <alpha-value>)',
          200: 'rgb(var(--bg-200) / <alpha-value>)',
          300: 'rgb(var(--bg-300) / <alpha-value>)',
          400: 'rgb(var(--bg-400) / <alpha-value>)',
          500: 'rgb(var(--bg-500) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
          100: 'rgb(var(--border-100) / <alpha-value>)',
          200: 'rgb(var(--border-200) / <alpha-value>)',
          300: 'rgb(var(--border-300) / <alpha-value>)',
          400: 'rgb(var(--border-400) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--text-tertiary) / <alpha-value>)',
          danger: 'rgb(var(--text-danger) / <alpha-value>)',
          0: 'rgb(var(--text-0) / <alpha-value>)',
          100: 'rgb(var(--text-100) / <alpha-value>)',
          200: 'rgb(var(--text-200) / <alpha-value>)',
          300: 'rgb(var(--text-300) / <alpha-value>)',
          400: 'rgb(var(--text-400) / <alpha-value>)',
          500: 'rgb(var(--text-500) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          hover: 'rgb(var(--accent-hover) / <alpha-value>)',
          focus: 'rgb(var(--accent-focus) / <alpha-value>)',
          terracotta: 'rgb(var(--accent-terracotta) / <alpha-value>)',
        },
        status: {
          approved: 'rgb(var(--status-approved-rgb) / <alpha-value>)',
          pending: 'rgb(var(--status-pending-rgb) / <alpha-value>)',
          rejected: 'rgb(var(--status-rejected-rgb) / <alpha-value>)',
        },
        
      },
      fontFamily: {
        sans: ['Inter', 'Arial', 'sans-serif'],
        serif: ['ui-serif', 'Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
        response: ['Inter', 'Georgia', 'sans-serif'],
        ui: ['Inter', 'Arial', 'sans-serif'], // controls use
        display: ['ui-serif', 'Georgia', 'serif'],
      },
      animation: {
        'slide-up': 'slideUpFade 0.3s ease-out forwards',
        'slide-down': 'slideDownFade 0.3s ease-in forwards',
        'slide-in-right': 'slideInRight 0.1s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.1s ease-out forwards',
      },
      keyframes: {
        slideUpFade: {
          '0%': {
            transform: 'translateX(-50%) translateY(100%)',
            opacity: '0',
          },
          '100%': {
            transform: 'translateX(-50%) translateY(0)',
            opacity: '1',
          },
        },
        slideDownFade: {
          '0%': {
            transform: 'translateX(-50%) translateY(0)',
            opacity: '1',
          },
          '100%': {
            transform: 'translateX(-50%) translateY(100%)',
            opacity: '0',
          },
        },
        slideInRight: {
          '0%': { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
