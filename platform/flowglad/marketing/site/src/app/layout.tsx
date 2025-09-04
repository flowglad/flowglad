import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Flowglad - Payments that anyone can program',
  description:
    "Build programmable payment solutions with Flowglad's developer-friendly platform",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
