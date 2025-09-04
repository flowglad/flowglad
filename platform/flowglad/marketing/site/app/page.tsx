import Link from 'next/link'
import { Button } from '@/components/ui/button'
import Header from '@/components/header'
import Footer from '@/components/footer'
import CodePanel from '@/components/code-panel'

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main>
        {/* Hero Section */}
        <section className="container py-24 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h1 className="text-4xl lg:text-6xl font-bold leading-tight">
                Make internet money
              </h1>
              <p className="text-xl text-muted-foreground max-w-md">
                The easiest way to monetize your app with subscription
                billing, usage tracking, and payment processing.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" asChild id="get-started">
                  <Link href="/docs">Get Started</Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="/docs">Read Docs</Link>
                </Button>
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <CodePanel />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
