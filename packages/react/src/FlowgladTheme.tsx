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
    // // Apply the class to the html element
    // document.documentElement.classList.add('flowglad-root')
    // // Apply the base theme class to the html element
    // document.documentElement.classList.add('flowglad-base-theme')

    // // Handle dark mode based on mode prop and system preference
    // if (mode === 'dark') {
    //   document.documentElement.classList.add('flowglad-dark')
    // } else if (mode === 'light') {
    //   document.documentElement.classList.remove('flowglad-dark')
    // } else if (mode === 'system') {
    //   document.documentElement.classList.add(
    //     isDarkTheme ? 'flowglad-dark' : 'flowglad-root'
    //   )
    // }

    // Generate CSS string
    themeToCss(theme).then((css) => {
      setCssString(css)
    })

    // // Cleanup function to remove the classes
    // return () => {
    //   document.documentElement.classList.remove(
    //     'flowglad-root',
    //     'flowglad-dark',
    //     'flowglad-base-theme'
    //   )
    // }
  }, [theme, mode, isDarkTheme])
  const baseClassname =
    'flowglad-root' + (isDarkTheme ? ' flowglad-dark' : '')
  return (
    <FlowgladThemeContext.Provider
      value={{
        theme,
        darkMode: isDarkTheme,
        nonce,
        themedCn: (inputs) => cn(baseClassname, inputs),
      }}
    >
      <style
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `${styles}\n${cssString}`,
        }}
        nonce={nonce}
        data-flowglad-theme
      />
      {children}
    </FlowgladThemeContext.Provider>
  )
}
