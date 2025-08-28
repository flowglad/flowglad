'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  actualTheme: 'light' | 'dark'
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'preview-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme)
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(storageKey) as Theme | null
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setTheme(stored)
    }
    setMounted(true)
  }, [storageKey])

  useEffect(() => {
    if (!mounted) return

    const root = document.documentElement
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      let effectiveTheme: 'light' | 'dark' = 'light'

      if (theme === 'system') {
        effectiveTheme = mediaQuery.matches ? 'dark' : 'light'
      } else {
        effectiveTheme = theme as 'light' | 'dark'
      }

      if (effectiveTheme === 'dark') {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }

      setActualTheme(effectiveTheme)
      localStorage.setItem(storageKey, theme)
    }

    applyTheme()

    const handleChange = () => {
      if (theme === 'system') {
        applyTheme()
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme, storageKey, mounted])

  const value = {
    theme,
    setTheme: (newTheme: Theme) => setTheme(newTheme),
    actualTheme
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
}