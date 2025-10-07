'use client'

import * as React from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface DataTableLinkableCellProps {
  href: string
  children: React.ReactNode
  className?: string
}

export function DataTableLinkableCell({
  href,
  children,
  className,
}: DataTableLinkableCellProps) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-0.5 group hover:underline transition-colors select-none',
        className
      )}
      onClick={(e) => {
        e.stopPropagation()
      }}
      title={`Go to ${children}`}
      aria-label={`Navigate to ${children}`}
    >
      <span className="truncate transition-colors">{children}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation() // Prevent double triggering
        }}
        title={`Go to ${children}`}
        tabIndex={-1} // Remove from tab order since container is focusable
        asChild
      >
        <span>
          <ArrowUpRight className="h-3 w-3" />
        </span>
      </Button>
    </Link>
  )
}
