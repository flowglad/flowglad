import type { Config } from 'tailwindcss'
import type { PluginAPI } from 'tailwindcss/types/config'
import tailwindAnimate from 'tailwindcss-animate'

export default {
  prefix: 'flowglad-',
  important: '.flowglad-root',
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--flowglad-background)',
        foreground: 'var(--flowglad-foreground)',
        card: {
          DEFAULT: 'var(--flowglad-card)',
          foreground: 'var(--flowglad-card-foreground)',
        },
        primary: {
          DEFAULT: 'var(--flowglad-primary)',
          foreground: 'var(--flowglad-primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--flowglad-secondary)',
          foreground: 'var(--flowglad-secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--flowglad-muted)',
          foreground: 'var(--flowglad-muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--flowglad-accent)',
          foreground: 'var(--flowglad-accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--flowglad-destructive)',
          foreground: 'var(--flowglad-destructive-foreground)',
        },
        border: 'var(--flowglad-border)',
        input: 'var(--flowglad-input)',
        ring: 'var(--flowglad-ring)',
      },
      borderRadius: {
        lg: 'var(--flowglad-radius)',
        md: 'calc(var(--flowglad-radius) - 2px)',
        sm: 'calc(var(--flowglad-radius) - 4px)',
      },
    },
  },
  // Disable Tailwind's base styles if you want full isolation
  corePlugins: {
    preflight: false,
    opacity: true,
  },
  // Configure variant generation for our custom prefix
  plugins: [
    tailwindAnimate,
    function ({
      matchUtilities,
      addUtilities,
      addVariant,
    }: PluginAPI) {
      // Add debug utility to test generation
      addUtilities({
        '.debug': {
          'background-color': 'red',
        },
      })

      // Add hover variant support with proper prefix handling
      addVariant('hover', () => '&:hover')

      // Match utilities with variants
      matchUtilities(
        {
          bg: (value: string) => ({
            'background-color': value,
          }),
          text: (value: string) => ({
            color: value,
          }),
          border: (value: string) => ({
            'border-color': value,
          }),
          ring: (value: string) => ({
            '--tw-ring-color': value,
          }),
        },
        {
          values: {
            background: 'var(--flowglad-background)',
            foreground: 'var(--flowglad-foreground)',
            card: 'var(--flowglad-card)',
            'card-foreground': 'var(--flowglad-card-foreground)',
            primary: 'var(--flowglad-primary)',
            'primary-foreground':
              'var(--flowglad-primary-foreground)',
            secondary: 'var(--flowglad-secondary)',
            'secondary-foreground':
              'var(--flowglad-secondary-foreground)',
            muted: 'var(--flowglad-muted)',
            'muted-foreground': 'var(--flowglad-muted-foreground)',
            accent: 'var(--flowglad-accent)',
            'accent-foreground': 'var(--flowglad-accent-foreground)',
            destructive: 'var(--flowglad-destructive)',
            'destructive-foreground':
              'var(--flowglad-destructive-foreground)',
            border: 'var(--flowglad-border)',
            input: 'var(--flowglad-input)',
            ring: 'var(--flowglad-ring)',
          },
          modifiers: {
            opacity: {
              '0': '0',
              '5': '0.05',
              '10': '0.1',
              '20': '0.2',
              '25': '0.25',
              '30': '0.3',
              '40': '0.4',
              '50': '0.5',
              '60': '0.6',
              '70': '0.7',
              '75': '0.75',
              '80': '0.8',
              '90': '0.933',
              '95': '0.95',
              '100': '1',
            },
          },
        }
      )
    },
  ],
} satisfies Config
