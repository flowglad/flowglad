'use client'
// @flowglad/react/src/FlowgladTheme.tsx
import React, { useEffect, useState } from 'react'
import { styles } from './generated/styles'

// Create a stable unique identifier for our styles
const STYLE_HREF = '@flowglad/react/styles'

// Import css-tools dynamically
let cssTools: { parse: any; stringify: any } | null = null

// Initialize css-tools
const initCssTools = async () => {
  if (!cssTools) {
    const module = await import('@adobe/css-tools')
    cssTools = {
      parse: module.parse,
      stringify: module.stringify,
    }
  }
  return cssTools
}

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

/**
 * Takes a tuple of [key, value] and returns a CSS AST rule for the theme entry
 * @param themeEntry
 * @returns CSS AST rule
 */
export function themeEntryToCssAst(
  themeEntry: [keyof FlowgladColors, string]
): any {
  const [key, value] = themeEntry
  const propertyMap: Record<keyof FlowgladColors, string> = {
    containerBackground: 'background',
    containerForeground: 'foreground',
    border: 'border',
    buttonBackground: 'button',
    buttonForeground: 'button-foreground',
    destructive: 'destructive',
    destructiveForeground: 'destructive-foreground',
  }

  return {
    type: 'rule',
    selectors: [`.flowglad-root`],
    declarations: [
      {
        type: 'declaration',
        property: `--flowglad-${propertyMap[key]}`,
        value,
      },
    ],
  }
}

/**
 * Converts a theme object to a CSS AST stylesheet
 * @param theme The theme object
 * @returns CSS AST stylesheet
 */
export function themeToCssAst(theme?: FlowgladThemeConfig): any {
  if (!theme) {
    return {
      type: 'stylesheet',
      stylesheet: {
        rules: [],
      },
    }
  }

  const propertyMap: Record<keyof FlowgladColors, string> = {
    containerBackground: 'background',
    containerForeground: 'foreground',
    border: 'border',
    buttonBackground: 'button',
    buttonForeground: 'button-foreground',
    destructive: 'destructive',
    destructiveForeground: 'destructive-foreground',
  }

  const rules: any[] = []

  if (theme.light) {
    const lightRule: any = {
      type: 'rule',
      selectors: ['.flowglad-root'],
      declarations: Object.entries(theme.light).map(
        ([key, value]) => ({
          type: 'declaration',
          property: `--flowglad-${propertyMap[key as keyof FlowgladColors]}`,
          value,
        })
      ),
    }
    rules.push(lightRule)
  }

  if (theme.dark) {
    const darkRule: any = {
      type: 'rule',
      selectors: ['.flowglad-dark'],
      declarations: Object.entries(theme.dark).map(
        ([key, value]) => ({
          type: 'declaration',
          property: `--flowglad-${propertyMap[key as keyof FlowgladColors]}`,
          value,
        })
      ),
    }
    rules.push(darkRule)
  }

  return {
    type: 'stylesheet',
    stylesheet: {
      rules,
    },
  }
}

/**
 * Converts a theme entry to a CSS string
 * @param themeEntry The theme entry
 * @returns CSS string
 */
export async function themeEntryToCss(
  themeEntry: [keyof FlowgladColors, string]
): Promise<string> {
  const rule = themeEntryToCssAst(themeEntry)
  const ast: any = {
    type: 'stylesheet',
    stylesheet: {
      rules: [rule],
    },
  }
  const { stringify } = await initCssTools()
  return stringify(ast)
}

/**
 * Converts a theme object to a CSS string
 * @param theme The theme object
 * @returns CSS string
 */
export async function themeToCss(
  theme?: FlowgladThemeConfig
): Promise<string> {
  const ast = themeToCssAst(theme)
  const { stringify } = await initCssTools()
  const css = stringify(ast)
  return css
}

interface FlowgladColors {
  containerBackground: string
  containerForeground: string
  border: string
  buttonBackground: string
  buttonForeground: string
  destructive: string
  destructiveForeground: string
}

export interface FlowgladThemeConfig {
  light?: Partial<FlowgladColors>
  dark?: Partial<FlowgladColors>
  mode?: 'light' | 'dark' | 'system'
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
        // @ts-expect-error - precedence is needed for hoisting
        precedence="high"
        href={STYLE_HREF}
        key={STYLE_HREF}
      />
      {children}
    </>
  )
}
