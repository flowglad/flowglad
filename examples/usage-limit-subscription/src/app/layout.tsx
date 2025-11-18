import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import {
  ReactQueryProvider,
  FlowgladProviderWrapper,
} from '@/components/providers';
import { Navbar } from '@/components/navbar';
import { PropsWithChildren } from 'react';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'usage-limit subscription example',
  description: 'Next.js starter template with BetterAuth and Flowglad',
};

export default async function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ReactQueryProvider>
          <FlowgladProviderWrapper>
            <Navbar />
            {children}
          </FlowgladProviderWrapper>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
