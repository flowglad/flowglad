'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Github, MessageSquare } from 'lucide-react'

export default function Header() {
  return (
    <header className="border-b border-border/40 backdrop-blur-sm">
      <div className="container flex h-14 items-center">
        <div className="mr-4 flex">
          <Link className="mr-6 flex items-center space-x-2" href="/">
            <div className="h-6 w-6 rounded-full bg-white"></div>
            <span className="font-bold">Flowglad</span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link
              className="transition-colors hover:text-foreground/80 text-foreground/60"
              href="/docs"
            >
              Docs
            </Link>
            <Link
              className="transition-colors hover:text-foreground/80 text-foreground/60"
              href="/blog"
            >
              Blog
            </Link>
            <Link
              className="transition-colors hover:text-foreground/80 text-foreground/60"
              href="/pricing"
            >
              Pricing
            </Link>
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none"></div>
          <nav className="flex items-center space-x-2">
            <Link
              href="/github"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9"
            >
              <Github className="h-4 w-4" />
              <span className="sr-only">GitHub</span>
            </Link>
            <Link
              href="/join-discord"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="sr-only">Discord</span>
            </Link>
            <Button asChild>
              <Link href="#get-started">Get Started</Link>
            </Button>
          </nav>
        </div>
      </div>
    </header>
  )
}
