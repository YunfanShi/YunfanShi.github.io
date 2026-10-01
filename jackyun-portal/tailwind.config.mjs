import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
const config = {
  // v3 emits ordinary CSS instead of requiring newer Android CSS layers/OKLCH.
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: ['selector', ':is([data-theme="gray"], [data-theme="dark"])'],
  theme: {
    extend: {
      borderColor: { DEFAULT: 'currentColor' },
    },
  },
  plugins: [typography],
};

export default config;
