'use client'

import { cn } from '@/lib/utils'

interface LightThemeWrapperProps {
  children: React.ReactNode
  className?: string
}

/**
 * Forces light theme for its children regardless of the global theme setting.
 *
 * This component:
 * 1. Sets explicit light theme colors using Tailwind classes
 * 2. Overrides any parent dark mode styling
 * 3. Ensures text remains readable on light backgrounds
 *
 * Use this for pages that should always appear in light mode,
 * such as checkout flows or payment forms.
 */
export function LightThemeWrapper({
  children,
  className,
}: LightThemeWrapperProps) {
  return (
    <div
      className={cn(
        // Force light theme colors with high specificity
        '!bg-white !text-gray-900',
        // Override text colors but preserve component-specific backgrounds
        '[&_h1]:!text-gray-900 [&_h2]:!text-gray-900 [&_h3]:!text-gray-900',
        '[&_p]:!text-gray-900 [&_span]:!text-gray-900 [&_div]:!text-gray-900',
        '[&_label]:!text-gray-900',
        // Handle inputs specifically
        '[&_input]:!text-gray-900 [&_input]:!bg-white',
        '[&_input:focus]:!bg-white [&_input:focus]:!border-gray-300',
        // Handle navigation and links
        '[&_a]:!text-gray-900',
        // Handle icons but preserve component styling for interactive elements
        '[&_.lucide]:!text-gray-700',
        '[&_svg]:!text-gray-700',
        // Force switch/toggle components to use light mode colors regardless of theme
        '[&_[role="switch"][data-state="unchecked"]]:!bg-gray-200', // Light grey when disabled
        '[&_[role="switch"][data-state="checked"]]:!bg-gray-900', // Dark when enabled
        '[&_[role="switch"]_span]:!bg-white', // White thumb
        // Apply to the full viewport and prevent any dark background bleeding
        'min-h-screen w-full relative overflow-hidden',
        // Ensure no dark mode can bleed through for the container
        'dark:!bg-white dark:!text-gray-900',
        // Override dark mode for text elements but preserve component functionality
        '[&_h1]:dark:!text-gray-900 [&_h2]:dark:!text-gray-900 [&_h3]:dark:!text-gray-900',
        '[&_p]:dark:!text-gray-900 [&_span]:dark:!text-gray-900 [&_div]:dark:!text-gray-900',
        '[&_label]:dark:!text-gray-900 [&_a]:dark:!text-gray-900',
        '[&_input]:dark:!text-gray-900 [&_input]:dark:!bg-white',
        className
      )}
      // Prevent theme inheritance from parent elements
      style={
        {
          colorScheme: 'light',
          backgroundColor: 'white',
          color: '#111827',
          // Override CSS custom properties for consistent light mode colors
          '--input': '229 231 235', // bg-gray-200 for unchecked state
          '--primary': '17 24 39', // bg-gray-900 for checked state
          '--background': '255 255 255', // white for thumb
          '--primary-foreground': '255 255 255', // white text on dark background
          '--muted': '249 250 251', // very light grey
          '--muted-foreground': '107 114 128', // medium grey text
        } as React.CSSProperties & { [key: string]: string | number }
      }
    >
      {children}
    </div>
  )
}
