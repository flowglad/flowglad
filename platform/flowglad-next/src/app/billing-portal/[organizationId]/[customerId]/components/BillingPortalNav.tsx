'use client'

import { CreditCard, FileText, Package } from 'lucide-react'

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

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
      icon: Package,
      description: 'Manage your subscription plan',
    },
    {
      id: 'payment-methods' as const,
      label: 'Payment Methods',
      icon: CreditCard,
      description: 'Add or update payment methods',
    },
    {
      id: 'invoices' as const,
      label: 'Invoices',
      icon: FileText,
      description: 'View and download invoices',
    },
  ]

  return (
    <nav className="border-b">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-0">
        {navItems.map((item) => {
          const Icon = item.icon
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
              <Icon
                className={cn(
                  'h-5 w-5 transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground group-hover:text-foreground'
                )}
              />

              <div className="flex flex-col">
                <span
                  className={cn(
                    'text-sm font-medium transition-colors',
                    isActive ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {item.label}
                </span>
                <span
                  className={cn(
                    'text-xs transition-colors',
                    isActive
                      ? 'text-primary/70'
                      : 'text-muted-foreground'
                  )}
                >
                  {item.description}
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
