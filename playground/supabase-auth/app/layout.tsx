import type { Metadata } from 'next'
import { type PropsWithChildren, Suspense } from 'react'
import Footer from '@/components/ui/Footer'
import Navbar from '@/components/ui/Navbar'
import { Toaster } from '@/components/ui/Toasts/toaster'
import { getURL } from '@/utils/helpers'
import { createClient } from '@/utils/supabase/server'
import '@/styles/main.css'
import { FlowgladProvider } from '@flowglad/nextjs'

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

export default async function RootLayout({
  children,
}: PropsWithChildren) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return (
    <html lang="en">
      <body>
        <FlowgladProvider
          loadBilling={!!user}
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
        </FlowgladProvider>
      </body>
    </html>
  )
}
