import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import Header from '@/components/header'
import Footer from '@/components/footer'
import { Check } from 'lucide-react'

export const metadata = {
  title: 'Pricing - Flowglad',
  description:
    'Simple, transparent pricing for developers. Start free and scale as you grow.',
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="container py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start free and scale as you grow. No hidden fees, no
            surprises.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3 max-w-6xl mx-auto">
          {/* Starter Plan */}
          <Card className="bg-card/50 border-border/40">
            <CardHeader>
              <CardTitle>Starter</CardTitle>
              <CardDescription>
                Perfect for side projects and early-stage startups
              </CardDescription>
              <div className="text-3xl font-bold">
                Free
                <span className="text-base font-normal text-muted-foreground ml-2">
                  forever
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Up to $1K monthly revenue
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Basic subscription management
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Stripe integration
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Email support
                </li>
              </ul>
              <Button className="w-full" variant="outline" asChild>
                <Link href="/docs">Get Started Free</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Pro Plan */}
          <Card className="bg-card/50 border-primary relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium">
                Most Popular
              </span>
            </div>
            <CardHeader>
              <CardTitle>Pro</CardTitle>
              <CardDescription>
                For growing businesses that need more features
              </CardDescription>
              <div className="text-3xl font-bold">
                $49
                <span className="text-base font-normal text-muted-foreground ml-2">
                  /month
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Up to $50K monthly revenue
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Usage-based billing
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Advanced analytics
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Webhook support
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Priority support
                </li>
              </ul>
              <Button className="w-full" asChild>
                <Link href="/docs">Start Pro Trial</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Enterprise Plan */}
          <Card className="bg-card/50 border-border/40">
            <CardHeader>
              <CardTitle>Enterprise</CardTitle>
              <CardDescription>
                For large organizations with custom needs
              </CardDescription>
              <div className="text-3xl font-bold">
                Custom
                <span className="text-base font-normal text-muted-foreground ml-2">
                  pricing
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Unlimited revenue
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Custom integrations
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  White-label options
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Dedicated support
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  SLA guarantees
                </li>
              </ul>
              <Button className="w-full" variant="outline" asChild>
                <Link href="mailto:sales@flowglad.com">
                  Contact Sales
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-16">
          <h2 className="text-2xl font-bold mb-4">
            Questions about pricing?
          </h2>
          <p className="text-muted-foreground mb-6">
            Join our Discord community to chat with other developers
            and get answers to your questions.
          </p>
          <Button variant="outline" asChild>
            <Link href="/join-discord">Join Discord</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  )
}
