'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { PaymentMethodRow } from './components/payment-method-row'
import { AddPaymentMethodButton } from './components/add-payment-method-button'
import type { PaymentMethodsListProps } from './types'

export function PaymentMethodsList({
  paymentMethods,
  defaultPaymentMethodId,
  onAddPaymentMethod,
  onRemovePaymentMethod,
  onSetDefault,
  loading = false,
  className,
}: PaymentMethodsListProps) {
  // Sort payment methods to show default first
  const sortedPaymentMethods = [...paymentMethods].sort((a, b) => {
    if (a.id === defaultPaymentMethodId) return -1
    if (b.id === defaultPaymentMethodId) return 1
    return 0
  })

  if (loading) {
    return (
      <div className={cn('space-y-3', className)}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 border rounded-lg"
          >
            <Skeleton className="h-8 w-12" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </div>
    )
  }

  if (paymentMethods.length === 0) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">
            No payment methods added yet
          </p>
          {onAddPaymentMethod && (
            <AddPaymentMethodButton
              onClick={onAddPaymentMethod}
              className="mx-auto max-w-xs"
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {sortedPaymentMethods.map((paymentMethod) => (
        <PaymentMethodRow
          key={paymentMethod.id}
          paymentMethod={paymentMethod}
          isDefault={paymentMethod.id === defaultPaymentMethodId}
          onRemove={onRemovePaymentMethod}
          onSetDefault={onSetDefault}
          loading={loading}
        />
      ))}

      {onAddPaymentMethod && (
        <AddPaymentMethodButton
          onClick={onAddPaymentMethod}
          loading={loading}
        />
      )}
    </div>
  )
}
