import type { Metadata } from 'next'
import { type PropsWithChildren, Suspense } from 'react'
import Footer from '@/components/ui/Footer'
import Navbar from '@/components/ui/Navbar'
import { Toaster } from '@/components/ui/Toasts/toaster'
import { getURL } from '@/utils/helpers'
import '@/styles/main.css'
import { Providers } from '@/components/Providers'

const title = 'Next.js Subscription Starter'
const description = 'Brought to you by Vercel, Stripe, and Supabase.'

export const metadata: Metadata = {
  metadataBase: new URL(getURL()),
  title: title,
  description: description,
  openGraph: {
    title: title,
    description: description,
  },
}

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body>
        <Providers
          requestConfig={{
            headers: {
              test: 'lol',
            },
          }}
        >
          <Navbar />
          <main
            id="skip"
            className="min-h-[calc(100dvh-4rem)] md:min-h[calc(100dvh-5rem)]"
          >
            {children}
          </main>
          <Footer />
          <Suspense>
            <Toaster />
          </Suspense>
        </Providers>
      </body>
    </html>
  )
}
