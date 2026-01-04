import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class", 
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        serif: ["var(--font-lora)", "serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: "var(--surface)",
        primary: "var(--primary)",
        secondary: "var(--secondary)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        border: "var(--border)",
        
        /* Semantic Tokens */
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
        info: "var(--info)",

        /* Interactive Tokens */
        hover: "var(--hover)",
        focus: "var(--focus)",

        /* Legacy/Utility mappings */
        paper: {
             DEFAULT: "#F9F7F2",
             dark: "#121412",
        },
        sage: {
           50: "#f4f7f4",
           100: "#e3ebe3",
           200: "#c5dnc5",
           300: "#9cb89c",
           400: "#7b9f7b",
           500: "#6B8E6B",
           600: "#547254",
           700: "#445b44",
           800: "#384938",
           900: "#2f3c2f",
           950: "#1a221a",
        },
        ink: "#1A1C1A",
        silver: "#E0E4E0",
      },
    },
  },
  plugins: [],
};
export default config;
