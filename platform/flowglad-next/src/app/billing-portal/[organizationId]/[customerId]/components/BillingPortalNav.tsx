'use client'

import { CreditCard, FileText, Package } from 'lucide-react'
import { cn } from '@/registry/lib/cn'

interface BillingPortalNavProps {
  activeSection: 'subscription' | 'payment-methods' | 'invoices'
  onSectionChange: (
    section: 'subscription' | 'payment-methods' | 'invoices'
  ) => void
}

export function BillingPortalNav({
  activeSection,
  onSectionChange,
}: BillingPortalNavProps) {
  const navItems = [
    {
      id: 'subscription' as const,
      label: 'Subscription',
    },
    {
      id: 'payment-methods' as const,
      label: 'Payment Methods',
    },
    {
      id: 'invoices' as const,
      label: 'Invoices',
    },
  ]

  return (
    <nav className="border-b">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-0">
        {navItems.map((item) => {
          const isActive = activeSection === item.id

          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={cn(
                'flex flex-col sm:flex-row items-start sm:items-center gap-2 px-4 py-3 sm:py-4 text-left transition-colors relative group flex-1 sm:flex-initial',
                'hover:bg-muted/50',
                isActive && 'text-primary'
              )}
            >
              <div className="flex flex-col">
                <span
                  className={cn(
                    'text-sm font-medium transition-colors',
                    isActive ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {item.label}
                </span>
              </div>

              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
