'use client'

import type { Organization } from '@db-core/schema/organizations'
import Image from 'next/image'
import * as React from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { PoweredByFlowglad } from '../powered-by-flowglad'

export interface PostPaymentSidebarProps {
  className?: string
  organization: Organization.Record
}

export const PostPaymentSidebar = React.forwardRef<
  HTMLDivElement,
  PostPaymentSidebarProps
>(({ className = '', organization }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'bg-card flex-1 h-full w-full max-w-[512px] flex flex-col justify-center items-start px-10 py-8 border-r border-border',
        className
      )}
    >
      <div className="w-full max-w-[372px] min-w-[328px] flex flex-col items-start justify-between h-full gap-8">
        {/* Spacer for top section */}
        <div className="flex-shrink-0" />

        {/* Main content */}
        <div className="flex-1 flex flex-col gap-6 items-start justify-center">
          {organization.logoURL && (
            <div className="flex-shrink-0">
              <Image
                src={organization.logoURL}
                alt={`${organization.name} logo`}
                width={100}
                height={100}
                className="object-contain rounded-full"
              />
            </div>
          )}

          <div className="space-y-2">
            <h1 className="text-5xl leading-[54px] font-semibold text-foreground">
              Order Complete!
            </h1>
            <p className="text-muted-foreground text-lg">
              Thank you for your purchase from {organization.name}.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex justify-start">
          <PoweredByFlowglad className="text-left" />
        </div>
      </div>
    </div>
  )
})

PostPaymentSidebar.displayName = 'PostPaymentSidebar'

export default PostPaymentSidebar
