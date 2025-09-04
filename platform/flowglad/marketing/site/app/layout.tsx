import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from 'next-themes'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://flowglad.com'),
  title: {
    default: 'Flowglad - Make internet money',
    template: '%s | Flowglad',
  },
  description:
    'The easiest way to monetize your app with subscription billing, usage tracking, and payment processing.',
  keywords: [
    'billing',
    'subscription',
    'payments',
    'usage-based billing',
    'SaaS',
    'monetization',
    'API',
    'developer tools',
  ],
  authors: [{ name: 'Flowglad Team' }],
  creator: 'Flowglad',
  publisher: 'Flowglad',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://flowglad.com',
    siteName: 'Flowglad',
    title: 'Flowglad - Make internet money',
    description:
      'The easiest way to monetize your app with subscription billing, usage tracking, and payment processing.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Flowglad - Make internet money',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Flowglad - Make internet money',
    description:
      'The easiest way to monetize your app with subscription billing, usage tracking, and payment processing.',
    images: ['/og-image.png'],
    creator: '@flowglad',
  },
  verification: {
    google: 'your-google-verification-code',
  },
  alternates: {
    canonical: 'https://flowglad.com',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased dark`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 bg-white text-black px-4 py-2 rounded-md font-medium transition-all"
          >
            Skip to content
          </a>
          <div id="main-content">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  )
}
