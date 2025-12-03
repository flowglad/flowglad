'use client'

import Link from 'next/link'
import type * as React from 'react'
import { cn } from '@/lib/utils'

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
        'inline-flex max-w-full items-center group hover:underline transition-colors select-none',
        className
      )}
      onClick={(e) => {
        e.stopPropagation()
      }}
      title={`Go to ${children}`}
      aria-label={`Navigate to ${children}`}
    >
      <span className="truncate transition-colors">{children}</span>
    </Link>
  )
}
