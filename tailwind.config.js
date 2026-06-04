/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'itam-dark':  '#0D3B2E',
        'itam-core':  '#1E5E4B',
        'itam-muted': '#8CA699',
        'base-cream': '#F4EFEB',
        'base-bone':  '#FCFAF8',
        'alert-rust': '#8C5E58',
      },
    },
  },
  plugins: [],
}
