import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#FFC107",
          dark: "#FF9800",
        },
        editor: {
          bg: "#0a0a0a",
          surface: "#141414",
          card: "#1a1a1a",
          border: "#2a2a2a",
          hover: "#252525",
        },
      },
      fontFamily: {
        clock: ["Barlow Condensed", "Oswald", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        body: ["Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
