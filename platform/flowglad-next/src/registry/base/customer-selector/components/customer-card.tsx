'use client'

import * as React from 'react'
import { Check, Building2, Calendar } from 'lucide-react'
import { cn } from '@/utils/core'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate } from '@/registry/lib/date'
import { CustomerAvatar } from './customer-avatar'
import type { CustomerCardProps } from '../types'

export function CustomerCard({
  customer,
  isSelected = false,
  onClick,
  className,
}: CustomerCardProps) {
  return (
    <Card
      className={cn(
        'relative cursor-pointer transition-all hover:shadow-md',
        isSelected && 'ring-2 ring-primary',
        className
      )}
      onClick={onClick}
    >
      {isSelected && (
        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary">
          <Check className="h-4 w-4 text-primary-foreground" />
        </div>
      )}

      <CardContent className="p-4">
        <div className="flex items-start space-x-3">
          <CustomerAvatar
            name={customer.name}
            avatarUrl={customer.avatarUrl}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm truncate">
              {customer.name}
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              {customer.email}
            </p>

            <div className="mt-2 space-y-1">
              {customer.organizationName && (
                <div className="flex items-center text-xs text-muted-foreground">
                  <Building2 className="mr-1 h-3 w-3" />
                  <span className="truncate">
                    {customer.organizationName}
                  </span>
                </div>
              )}

              <div className="flex items-center text-xs text-muted-foreground">
                <Calendar className="mr-1 h-3 w-3" />
                <span>Created {formatDate(customer.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
