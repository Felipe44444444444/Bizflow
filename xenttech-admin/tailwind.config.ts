import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border:     "hsl(var(--border) / <alpha-value>)",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        // ── Brand accent ─────────────────────────────
        teal: {
          DEFAULT: "#00D4AA",
          dim:     "rgba(0,212,170,0.09)",
        },
        // ── Neon palette (legacy) ─────────────────────
        neon: {
          cyan:   "#00D4AA",
          purple: "#7C3AED",
          pink:   "#FF2F7B",
          green:  "#10B981",
          yellow: "#F59E0B",
          red:    "#EF4444",
        },
        // ── Space (dark BG) palette ──────────────────
        space: {
          DEFAULT: "#02020A",
          surface: "#080812",
          card:    "#0D0D1F",
          el:      "#12122A",
          hover:   "#1A1A35",
          active:  "#2D2D5C",
        },
      },
      fontFamily: {
        sans:    ["Inter", "system-ui", "-apple-system", "sans-serif"],
        display: ["Space Grotesk", "Inter", "sans-serif"],
        mono:    ["JetBrains Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        "glow-cyan":   "0 0 20px rgba(0,245,255,0.3), 0 0 40px rgba(0,245,255,0.1)",
        "glow-cyan-sm":"0 0 12px rgba(0,245,255,0.25)",
        "glow-purple": "0 0 20px rgba(123,47,255,0.3), 0 0 40px rgba(123,47,255,0.1)",
        "glow-pink":   "0 0 20px rgba(255,47,123,0.3)",
        "glow-green":  "0 0 20px rgba(0,255,136,0.3)",
        "card":        "0 4px 24px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)",
        "card-hover":  "0 8px 40px rgba(0,0,0,0.5), 0 0 40px rgba(0,245,255,0.08)",
        "modal":       "0 0 60px rgba(0,245,255,0.05), 0 24px 48px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        "gradient-cyan-purple": "linear-gradient(135deg, #00F5FF 0%, #7B2FFF 100%)",
        "gradient-purple-pink": "linear-gradient(135deg, #7B2FFF 0%, #FF2F7B 100%)",
        "gradient-cyan-green":  "linear-gradient(135deg, #00F5FF 0%, #00FF88 100%)",
        "mesh-dark": "radial-gradient(ellipse at 20% 50%, rgba(0,245,255,0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(123,47,255,0.04) 0%, transparent 60%)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 8px rgba(0,245,255,0.4)" },
          "50%": { opacity: "0.6", boxShadow: "0 0 24px rgba(0,245,255,0.9)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-400% 0" },
          "100%": { backgroundPosition: "400% 0" },
        },
        "slide-in-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.9)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
        "gradient-shift": {
          "0%":   { backgroundPosition: "0% 50%" },
          "50%":  { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "count-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down":  "accordion-down 0.2s ease-out",
        "accordion-up":    "accordion-up 0.2s ease-out",
        "pulse-glow":      "pulse-glow 2s ease-in-out infinite",
        float:             "float 3s ease-in-out infinite",
        shimmer:           "shimmer 1.5s linear infinite",
        "slide-in-up":     "slide-in-up 0.4s cubic-bezier(0.4,0,0.2,1) forwards",
        "slide-in-right":  "slide-in-right 0.4s cubic-bezier(0.4,0,0.2,1) forwards",
        "fade-in":         "fade-in 0.3s ease forwards",
        "scale-in":        "scale-in 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
        "gradient-shift":  "gradient-shift 6s ease infinite",
        "count-up":        "count-up 0.5s ease forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
