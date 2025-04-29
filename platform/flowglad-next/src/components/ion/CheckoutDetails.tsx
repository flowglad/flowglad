'use client'
// Generated with Ion on 10/1/2024, 2:36:10 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=640:29781
import * as React from 'react'
import clsx from 'clsx'
import BillingHeader from '@/components/ion/BillingHeader'
import SellerInfo from '@/components/ion/SellerInfo'

const CheckoutDetails = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={clsx(
        'items-center lg:items-end flex flex-col lg:w-[444px] max-w-[380px] m-auto lg:m-0',
        className
      )}
    >
      <SellerInfo data-testid="seller-info" />
      <div className="w-full relative flex flex-col items-start gap-8">
        <BillingHeader data-testid="billing-header" />
      </div>
    </div>
  )
})

CheckoutDetails.displayName = 'CheckoutDetails'

export default CheckoutDetails
