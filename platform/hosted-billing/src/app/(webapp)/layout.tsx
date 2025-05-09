import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { cn } from '@/utils/cn'
import './globals.css'
import Providers from './Providers'
import { StackProvider } from '@stackframe/stack'
import { globalStackServerApp } from '@/stack'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Billing',
  description: 'Billing',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <StackProvider app={globalStackServerApp}>
      <html lang="en" className="dark h-full">
        <body className={cn(inter.className, 'dark', 'h-full')}>
          <Providers>{children}</Providers>
        </body>
      </html>
    </StackProvider>
  )
}
