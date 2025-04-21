// @flowglad/react/src/FlowgladTheme.tsx
import React, { useEffect, useState } from 'react'
import { styles } from './generated/styles'

interface FlowgladThemeProps {
  children: React.ReactNode
  darkMode?: boolean
  nonce?: string
}

// Create a stable unique identifier for our styles
const STYLE_HREF = '@flowglad/react/styles'

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

export const FlowgladTheme: React.FC<FlowgladThemeProps> = ({
  children,
  darkMode,
  nonce,
}) => {
  const isDarkTheme = useThemeDetector()
  useEffect(() => {
    // Apply the class to the html element
    document.documentElement.classList.add('flowglad-root')
    // If darkMode is provided, apply the class to the html element
    // If darkMode is not provided, use the system theme
    if (typeof darkMode === 'boolean') {
      if (darkMode) {
        document.documentElement.classList.add('flowglad-dark')
      } else {
        document.documentElement.classList.remove('flowglad-dark')
      }
    } else if (isDarkTheme) {
      document.documentElement.classList.add('flowglad-dark')
    }

    // Cleanup function to remove the classes
    return () => {
      document.documentElement.classList.remove(
        'flowglad-root',
        'flowglad-dark'
      )
    }
  }, [darkMode])

  return (
    <>
      <style
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: styles,
        }}
        nonce={nonce}
        // @ts-expect-error - precedence is needed for hoisting
        precedence="high"
        href={STYLE_HREF}
        key={STYLE_HREF}
      />
      {children}
    </>
  )
}
