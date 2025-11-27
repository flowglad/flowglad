'use client'

import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from 'next-themes'
import * as React from 'react'

export function ThemeProvider({
  children,
  ...props
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      {...props}
      // Ensure proper SSR behavior
      value={{
        light: 'light',
        dark: 'dark',
        system: 'system',
      }}
    >
      {children}
    </NextThemesProvider>
  )
}
