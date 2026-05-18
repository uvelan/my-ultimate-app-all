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
        background: {
          DEFAULT: "var(--color-bg)",
          surface: "var(--color-surface)",
        },
        primary: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          foreground: "var(--color-text)",
        },
        secondary: {
          DEFAULT: "var(--color-surface)",
          hover: "var(--color-border)",
          foreground: "var(--color-text)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          focus: "var(--color-accent)",
        },
        text: {
          primary: "var(--color-text)",
          secondary: "var(--color-muted)",
          muted: "var(--color-muted)",
        },
        accent: {
          DEFAULT: "rgb(var(--color-accent-rgb) / <alpha-value>)",
        },
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
        sans: ["var(--font-body)"],
      },
      spacing: {
        'space-1': 'var(--space-1)',
        'space-2': 'var(--space-2)',
        'space-3': 'var(--space-3)',
        'space-4': 'var(--space-4)',
        'space-6': 'var(--space-6)',
        'space-8': 'var(--space-8)',
        'space-12': 'var(--space-12)',
        'space-16': 'var(--space-16)',
        'space-24': 'var(--space-24)',
      },
      borderRadius: {
        'radius-sm': 'var(--radius-sm)',
        'radius-md': 'var(--radius-md)',
        'radius-lg': 'var(--radius-lg)',
        'radius-xl': 'var(--radius-xl)',
        'radius-full': 'var(--radius-full)',
      },
      boxShadow: {
        'shadow-sm': 'var(--shadow-sm)',
        'shadow-md': 'var(--shadow-md)',
        'shadow-lg': 'var(--shadow-lg)',
        'shadow-glow': 'var(--shadow-glow)',
      },
      transitionTimingFunction: {
        'ease-out': 'var(--ease-out)',
        'ease-in-out': 'var(--ease-in-out)',
      },
      transitionDuration: {
        'fast': 'var(--duration-fast)',
        'premium': 'var(--duration-base)',
        'base': 'var(--duration-base)',
        'slow': 'var(--duration-slow)',
      },
      fontSize: {
        'display': ['3.75rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'h1': ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'h2': ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
        'h3': ['1.5rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' }],
        'h4': ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body': ['1rem', { lineHeight: '1.6', fontWeight: '400' }],
        'small': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['0.75rem', { lineHeight: '1.4', fontWeight: '400' }],
      },
    },
  },
  plugins: [],
};

export default config;
