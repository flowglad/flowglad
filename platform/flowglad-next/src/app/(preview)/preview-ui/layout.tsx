import { ThemeProvider } from './components/ThemeProvider'
import { arizonaFlare, sfPro, berkeleyMono } from '@/lib/fonts'
import { cn } from '@/lib/utils'

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={cn(
        arizonaFlare.variable,
        sfPro.variable,
        berkeleyMono.variable
      )}
      suppressHydrationWarning
    >
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
        <title>Component Preview - Flowglad UI</title>
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/preview/preview.css" />
      </head>
      <body className={cn(sfPro.className)} suppressHydrationWarning>
        <ThemeProvider
          defaultTheme="system"
          storageKey="preview-theme"
        >
          <div id="preview-root" data-preview-container>
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
