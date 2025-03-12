// @flowglad/react/src/FlowgladTheme.tsx
import React from 'react'
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

  return (
    <>
      <style
        suppressHydrationWarning // we need this since the nonce can differ between client and server
        dangerouslySetInnerHTML={{
          //   __html: `.flowglad-root{font-family:sans-serif}.flowglad-dark{color-scheme:dark}`,
          __html: styles,
        }}
        nonce={nonce}
        precedence="default"
        href={STYLE_HREF}
        key={STYLE_HREF}
      />
      {children}
    </>
  )
}
