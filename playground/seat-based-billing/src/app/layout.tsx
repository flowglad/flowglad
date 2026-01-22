import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { FlowgladProvider } from '@flowglad/nextjs'
import { PropsWithChildren } from 'react'
import { Navbar } from '@/components/navbar'
import { ReactQueryProvider } from '@/components/providers'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'gen-based subscription example',
  description:
    'Next.js starter template with BetterAuth and Flowglad',
}

export default async function RootLayout({
  children,
}: PropsWithChildren) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ReactQueryProvider>
          <FlowgladProvider betterAuthBasePath="/api/auth">
            <Navbar />
            {children}
          </FlowgladProvider>
        </ReactQueryProvider>
      </body>
    </html>
  )
}
