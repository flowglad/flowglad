'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { type ThemeProviderProps } from 'next-themes/dist/types'

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
