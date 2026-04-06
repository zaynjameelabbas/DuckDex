/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sky-blue-light': '#8ecae6',
        'blue-green': '#219ebc',
        'deep-space-blue': '#023047',
        'amber-flame': '#ffb703',
        'princeton-orange': '#fb8500',
      },
      fontFamily: {
        'display': ['Poppins', 'ui-sans-serif', 'system-ui'],
        'body': ['Inter', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
}
