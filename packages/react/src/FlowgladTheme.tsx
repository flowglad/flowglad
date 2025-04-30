'use client'
// @flowglad/react/src/FlowgladTheme.tsx
import React, { useEffect, useState } from 'react'
import { styles } from './generated/styles'
import { themeToCss, type FlowgladThemeConfig } from './lib/themes'

const useThemeDetector = () => {
  const getCurrentTheme = () =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  const [isDarkTheme, setIsDarkTheme] = useState(getCurrentTheme())
  const mqListener = (e: MediaQueryListEvent) => {
    setIsDarkTheme(e.matches)
  }

  useEffect(() => {
    const darkThemeMq = window.matchMedia(
      '(prefers-color-scheme: dark)'
    )
    darkThemeMq.addEventListener('change', mqListener)
    return () => darkThemeMq.removeEventListener('change', mqListener)
  }, [])
  return isDarkTheme
}

interface FlowgladThemeProps {
  children: React.ReactNode
  darkMode?: boolean
  nonce?: string
  theme?: FlowgladThemeConfig
}

export function FlowgladTheme({
  children,
  theme,
  nonce,
}: FlowgladThemeProps) {
  const isDarkTheme = useThemeDetector()
  const [cssString, setCssString] = useState<string>('')
  const mode = theme?.mode ?? 'system'
  useEffect(() => {
    // Apply the class to the html element
    document.documentElement.classList.add('flowglad-root')
    // Apply the base theme class to the html element
    document.documentElement.classList.add('flowglad-base-theme')

    // Handle dark mode based on mode prop and system preference
    if (mode === 'dark') {
      document.documentElement.classList.add('flowglad-dark')
    } else if (mode === 'light') {
      document.documentElement.classList.remove('flowglad-dark')
    } else if (mode === 'system') {
      document.documentElement.classList.add(
        isDarkTheme ? 'flowglad-dark' : 'flowglad-root'
      )
    }

    // Generate CSS string
    themeToCss(theme).then((css) => {
      setCssString(css)
    })

    // Cleanup function to remove the classes
    return () => {
      document.documentElement.classList.remove(
        'flowglad-root',
        'flowglad-dark',
        'flowglad-base-theme'
      )
    }
  }, [theme, mode, isDarkTheme])
  return (
    <>
      <style
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `${styles}\n${cssString}`,
        }}
        nonce={nonce}
        data-flowglad-theme
      />
      {children}
    </>
  )
}
