// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  daisyui: {
    themes: [
      {
        arexamly: {
          "primary": "#0f766e",
          "secondary": "#0369a1",
          "accent": "#f59e0b",
          "neutral": "#1f2937",
          "base-100": "#ffffff",
          "base-200": "#f3f4f6",
          "base-300": "#e5e7eb",
          "info": "#0284c7",
          "success": "#16a34a",
          "warning": "#d97706",
          "error": "#dc2626"
        }
      },
      "light",
      "dark"
    ],
    darkTheme: "dark",
    base: true,
    styled: true,
    utils: true,
    rtl: false,
    prefix: "",
    logs: true,
  },
}
