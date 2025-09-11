'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { useCheckoutPageContext } from '@/contexts/checkoutPageContext'
import Image from 'next/image'

export interface SellerInfoProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export const SellerInfo = React.forwardRef<
  HTMLDivElement,
  SellerInfoProps
>(({ className, ...props }, ref) => {
  const { sellerOrganization } = useCheckoutPageContext()
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-3',
        'h-auto', // Remove fixed height
        className
      )}
      {...props}
    >
      {sellerOrganization.logoURL && (
        <div
          className={cn(
            'bg-background border border-border/50', // Adaptive background
            'h-6 w-6 flex justify-center items-center', // LS size
            'rounded-full shadow-sm' // Subtle shadow
          )}
        >
          <Image
            src={sellerOrganization.logoURL ?? ''}
            alt={sellerOrganization.name}
            className="h-6 w-6 rounded-full object-cover"
            width={24}
            height={24}
          />
        </div>
      )}
      <span
        className={cn(
          'text-[14px] font-medium', // LS typography
          'text-foreground dark:text-white' // Adaptive color
        )}
      >
        {sellerOrganization.name}
      </span>
    </div>
  )
})

SellerInfo.displayName = 'SellerInfo'
