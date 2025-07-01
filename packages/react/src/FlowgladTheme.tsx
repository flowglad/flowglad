'use client'
// @flowglad/react/src/FlowgladTheme.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'
import { styles } from './generated/styles'
import { themeToCss, type FlowgladThemeConfig } from './lib/themes'
import { cn } from './lib/utils'

export const useIsDarkTheme = (mode: 'light' | 'dark' | 'system') => {
  const getCurrentTheme = () => {
    if (mode === 'dark') {
      return true
    }
    if (mode === 'light') {
      return false
    }
    if (typeof window === 'undefined') {
      return false
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
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

interface FlowgladThemeContextType {
  theme: FlowgladThemeConfig | undefined
  darkMode: boolean | undefined
  nonce: string | undefined
  themedCn: typeof cn
}

const FlowgladThemeContext = createContext<FlowgladThemeContextType>({
  theme: undefined,
  darkMode: undefined,
  nonce: undefined,
  themedCn: () => '',
})

export const useFlowgladTheme = (): FlowgladThemeContextType => {
  return useContext(FlowgladThemeContext)
}

export function FlowgladThemeProvider({
  children,
  theme,
  nonce,
}: FlowgladThemeProps) {
  const mode = theme?.mode ?? 'system'
  const isDarkTheme = useIsDarkTheme(mode)
  const [cssString, setCssString] = useState<string>('')

  useEffect(() => {
    // Generate CSS string
    themeToCss(theme).then((css) => {
      setCssString(css)
    })
  }, [theme]) // Removed mode and isDarkTheme from deps as they don't affect cssString generation directly from theme

  const themeWrapperClassName = cn(
    'flowglad-root',
    'flowglad-base-theme',
    isDarkTheme ? 'flowglad-dark' : ''
  )

  const contextValue = {
    theme,
    darkMode: isDarkTheme,
    nonce,
    themedCn: (inputs: any) =>
      cn('flowglad-root', isDarkTheme ? 'flowglad-dark' : '', inputs),
  }

  return (
    <FlowgladThemeContext.Provider value={contextValue}>
      <style
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `${styles}\n${cssString}`,
        }}
        nonce={nonce}
        data-flowglad-theme
      />
      <div>{children}</div>
    </FlowgladThemeContext.Provider>
  )
}
