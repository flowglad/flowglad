import { Metadata } from 'next';
import Footer from '@/components/ui/Footer';
import Navbar from '@/components/ui/Navbar';
import { Toaster } from '@/components/ui/Toasts/toaster';
import { PropsWithChildren, Suspense } from 'react';
import { getURL } from '@/utils/helpers';
import { createClient } from '@/utils/supabase/server';
import '@/styles/main.css';
import { FlowgladProvider } from '@flowglad/nextjs';

const title = 'Next.js Subscription Starter';
const description = 'Brought to you by Vercel, Stripe, and Supabase.';

export const metadata: Metadata = {
  metadataBase: new URL(getURL()),
  title: title,
  description: description,
  openGraph: {
    title: title,
    description: description
  }
};

export default async function RootLayout({ children }: PropsWithChildren) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return (
    <html lang="en">
      <body className="bg-black">
        <FlowgladProvider
          loadBilling={!!user}
          requestConfig={{
            headers: {
              test: 'lol'
            }
          }}
          theme={{
            light: {
              background: 'hsl(0 100% 50%)',
              card: 'hsl(0 0% 100%)',
              cardForeground: 'rgba(255, 0, 0, 0.8)',
              // containerForeground: '#000000',
              border: '#cccccc'
              // buttonBackground: '#007bff',
              // buttonForeground: '#ffffff',
              // destructive: '#dc3545',
              // destructiveForeground: '#ffffff'
            },
            dark: {
              // background: 'hsl(0 100% 50%)',
              // card: 'hsl(125 85% 3.9%)',
              // cardForeground: 'rgba(255, 0, 0, 0.8)',
              // foreground: 'rgba(255, 0, 0, 0.5)',
              // border: 'rgba(0, 255, 0, 0.5)'
              // containerForeground: '#ffffff',
              // border: '#0000'
              // buttonBackground: '#0d6efd',
              // buttonForeground: '#ffffff',
              // destructive: '#dc3545',
              // destructiveForeground: '#ffffff'
            }
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
  );
}
