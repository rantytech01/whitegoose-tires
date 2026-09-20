import type { Config } from "tailwindcss";

// Brand tokens from the WhiteGoose identity — see docs/design-tokens.md
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0D0D0D",
        goose: {
          orange: "#FF6B00",
          orangeDark: "#E05F00",
        },
        tarmac: "#F1F0EC",
        graphite: "#4A4A48",
      },
      fontFamily: {
        display: ["\"Big Shoulders Display\"", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
