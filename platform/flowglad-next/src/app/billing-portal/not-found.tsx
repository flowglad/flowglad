'use client'

import { ArrowLeft, Home, Search } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-4">
          <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center">
            <Search className="h-12 w-12 text-muted-foreground" />
          </div>
          <h1 className="text-4xl font-bold text-foreground">404</h1>
          <h2 className="text-2xl font-semibold text-foreground">
            Page Not Found
          </h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            The billing portal page you&apos;re looking for
            doesn&apos;t exist. Please check the URL or navigate back
            to a valid page.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="default" asChild>
            <Link href="/billing-portal">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Billing Portal Help
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
