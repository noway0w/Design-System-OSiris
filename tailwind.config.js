/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public_html/**/*.html',
    './public_html/**/*.js',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#1392ec',
        'background-light': '#f6f7f8',
        'background-dark': '#101a22',
        'card-light': '#E4EBF1',
        'card-dark': '#1c262d',
        'text-secondary': '#9db0b9',
      },
      fontFamily: {
        display: ['Plus Jakarta Sans', 'sans-serif'],
        editorial: ['Plus Jakarta Sans', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '1rem',
        lg: '2rem',
        xl: '3rem',
        '2xl': '1rem',
        full: '9999px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};
