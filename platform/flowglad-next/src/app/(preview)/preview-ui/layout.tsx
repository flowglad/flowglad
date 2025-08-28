import { Inter } from 'next/font/google'
import { ThemeProvider } from './components/ThemeProvider'

const inter = Inter({ subsets: ['latin'] })

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Component Preview - Flowglad UI</title>
        <link rel="stylesheet" href="/preview/preview.css" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider defaultTheme="system" storageKey="preview-theme">
          <div id="preview-root" data-preview-container>
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}