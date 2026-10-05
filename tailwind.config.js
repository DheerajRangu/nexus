/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#102A43",
        muted: "#486581",
        teal: "#0F766E",
        "teal-dark": "#115E59",
        foam: "#F4F7F8",
        pine: "#065F46",
        mist: "#E7F5F2",
        line: "#D9E2EC",
        alert: "#92400E",
        alertbg: "#FFFBEB",
      },
    },
  },
  plugins: [],
};
