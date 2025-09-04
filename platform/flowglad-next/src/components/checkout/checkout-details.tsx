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
      className={cn(
        'items-center lg:items-end flex flex-col lg:w-[444px] max-w-[380px] m-auto lg:m-0',
        className
      )}
      {...props}
    >
      <SellerInfo data-testid="seller-info" />
      <div className="w-full relative flex flex-col items-start gap-8">
        <BillingHeader data-testid="billing-header" />
      </div>
    </div>
  )
})

CheckoutDetails.displayName = 'CheckoutDetails'
