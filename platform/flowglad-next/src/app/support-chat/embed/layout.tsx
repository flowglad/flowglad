import TrpcProvider from '@/app/_trpc/Provider'
import { ThemeProvider } from '@/components/theme-provider'
import { arizonaFlare, berkeleyMono, sfPro } from '@/lib/fonts'
import { cn } from '@/lib/utils'
import '../../../app/globals.css'

export default function EmbedLayout({
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
      <body
        className={cn(sfPro.className, 'antialiased')}
        style={{ background: 'transparent' }}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          disableTransitionOnChange
        >
          <TrpcProvider>{children}</TrpcProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
