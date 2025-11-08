import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ReactQueryProvider } from '@/components/providers';
import { Navbar } from '@/components/navbar';
import { FlowgladProvider } from '@flowglad/react';
import { PropsWithChildren } from 'react';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'gen-based subscription example',
  description: 'Next.js starter template with BetterAuth and Flowglad',
};

export default async function RootLayout({ children }: PropsWithChildren) {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ReactQueryProvider>
          <FlowgladProvider loadBilling={!!user}>
            <Navbar />
            {children}
          </FlowgladProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
