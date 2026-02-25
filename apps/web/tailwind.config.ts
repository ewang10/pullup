import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#6C63FF',
          50: '#F0EFFF',
          100: '#E0DEFF',
          200: '#C1BDFF',
          300: '#A29CFF',
          400: '#837BFF',
          500: '#6C63FF',
          600: '#3428FF',
          700: '#0800EB',
          800: '#0600B3',
          900: '#04007B',
        },
        dark: {
          DEFAULT: '#1A1A2E',
          50: '#4A4A7A',
          100: '#42426E',
          200: '#383862',
          300: '#303056',
          400: '#26264A',
          500: '#1A1A2E',
          600: '#161628',
          700: '#121222',
          800: '#0E0E1C',
          900: '#0A0A16',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
