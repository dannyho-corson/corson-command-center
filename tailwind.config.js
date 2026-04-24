/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Body / UI — humanist sans, very readable, premium feel
        sans:    ['Manrope', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Headings, brand, big numbers — geometric, distinctive
        display: ['"Space Grotesk"', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Fees, dates, codes — high tabular legibility
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Refined indigo (Corson brand)
        indigo: {
          50:  '#EEF0FF',
          100: '#E0E4FF',
          200: '#C5CCFF',
          300: '#A4ADFF',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          950: '#1E1B4B',
        },
        // Surface palette — slightly tuned cool greys for premium feel
        ink: {
          950: '#0B0F1A',  // page background
          900: '#111827',  // panel surface (matches existing)
          800: '#1A2233',
          700: '#283040',
        },
      },
      boxShadow: {
        // Soft, layered shadows for premium card feel
        'soft':       '0 1px 2px 0 rgba(0, 0, 0, 0.25), 0 1px 1px 0 rgba(0, 0, 0, 0.15)',
        'card':       '0 4px 16px -4px rgba(0, 0, 0, 0.4), 0 2px 6px -2px rgba(0, 0, 0, 0.25)',
        'card-hover': '0 10px 30px -8px rgba(99, 102, 241, 0.25), 0 4px 12px -4px rgba(0, 0, 0, 0.5)',
        'glow-indigo':'0 0 0 1px rgba(99, 102, 241, 0.15), 0 8px 24px -8px rgba(99, 102, 241, 0.35)',
      },
      transitionTimingFunction: {
        'out-quint': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
