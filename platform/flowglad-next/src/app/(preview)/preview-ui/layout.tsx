import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Component Preview - Flowglad UI</title>
      </head>
      <body className={inter.className}>
        <div id="preview-root" data-preview-container>
          {children}
        </div>
      </body>
    </html>
  )
}