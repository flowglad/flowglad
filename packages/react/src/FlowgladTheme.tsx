// @flowglad/react/src/FlowgladTheme.tsx
import React, { useEffect } from 'react'
import { styles } from './generated/styles'

interface FlowgladThemeProps {
  children: React.ReactNode
  darkMode?: boolean
  nonce?: string
}

// Create a stable unique identifier for our styles
const STYLE_HREF = '@flowglad/react/styles'

export const FlowgladTheme: React.FC<FlowgladThemeProps> = ({
  children,
  darkMode = false,
  nonce,
}) => {
  const rootClassName = `flowglad-root${darkMode ? ' flowglad-dark' : ''}`

  useEffect(() => {
    // Apply the class to the html element
    document.documentElement.classList.add('flowglad-root')
    if (darkMode) {
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
