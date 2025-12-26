import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/registry/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        heading: ['var(--font-heading)', 'serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down':
          'accordion-down 0.2s cubic-bezier(0.87, 0, 0.13, 1)',
        'accordion-up':
          'accordion-up 0.2s cubic-bezier(0.87, 0, 0.13, 1)',
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
          secondary: 'hsl(var(--muted-secondary))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
          muted: 'hsl(var(--muted-card))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground':
            'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground':
            'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        jade: {
          foreground: 'hsl(var(--jade-foreground))',
          'muted-foreground': 'hsl(var(--jade-muted-foreground))',
          background: 'hsl(var(--jade-background))',
        },
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        medium:
          '-3px 4px 21px 0px rgba(0, 0, 0, 0.05), -2px 2px 4px 0px rgba(0, 0, 0, 0.04)',
        'realistic-md':
          'rgba(0, 0, 0, 0.07) 0.398096px 0.398096px 0.562993px -0.9375px, rgba(0, 0, 0, 0.07) 1.20725px 1.20725px 1.70731px -1.875px, rgba(0, 0, 0, 0.06) 3.19133px 3.19133px 4.51322px -2.8125px, rgba(0, 0, 0, 0.03) 10px 10px 14.1421px -3.75px',
        'realistic-sm':
          'rgba(0, 0, 0, 0.04) 0px 0.301094px 0.301094px -1.25px, rgba(0, 0, 0, 0.08) 0px 1.14427px 1.14427px -2.5px, rgba(0, 0, 0, 0.03) 0px 5px 5px -3.75px',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('tailwindcss-animate'),
    /**
     * Tailwind utils to hide scrollbars
     * @see https://stackoverflow.com/a/66436651
     */
    plugin(({ addUtilities }) => {
      addUtilities({
        '.scrollbar-hidden::-webkit-scrollbar': {
          display: 'none',
        },
        '.scrollbar-hidden': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
        },
      })
    }),
  ],
  darkMode: 'class',
}

export default config
