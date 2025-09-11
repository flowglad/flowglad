'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { BillingHeader } from './billing-header'
import { SellerInfo } from './seller-info'

interface CheckoutDetailsProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export const CheckoutDetails = React.forwardRef<
  HTMLDivElement,
  CheckoutDetailsProps
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col gap-8', 'w-full', className)}
      {...props}
    >
      {/* Seller Info */}
      <SellerInfo
        data-testid="seller-info"
        className="flex items-center gap-3"
      />

      {/* Billing Header with Product Details */}
      <BillingHeader
        data-testid="billing-header"
        className="w-full"
      />
    </div>
  )
})

CheckoutDetails.displayName = 'CheckoutDetails'
