'use client'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { useState } from 'react'
import EditCustomerModal from '@/components/forms/EditCustomerModal'
import MigrateCustomerPricingModelModal from '@/components/forms/MigrateCustomerPricingModelModal'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import PopoverMenu, {
  type PopoverMenuItem,
} from '@/components/PopoverMenu'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { Customer } from '@/db/schema/customers'
import type { Payment } from '@/db/schema/payments'
import type { Price } from '@/db/schema/prices'
import type { UsageEvent } from '@/db/schema/usageEvents'
import { CustomerBillingSubPage } from './CustomerDetailsBillingTab'

function InternalCustomerDetailsScreen({
  customer,
  payments,
  usageEvents,
}: {
  customer: Customer.ClientRecord
  payments: Payment.ClientRecord[]
  prices: Price.ClientRecord[]
  usageEvents: UsageEvent.ClientRecord[]
}) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isMigrateOpen, setIsMigrateOpen] = useState(false)

  const moreMenuItems: PopoverMenuItem[] = [
    {
      label: 'Migrate Pricing Model',
      handler: () => setIsMigrateOpen(true),
    },
    {
      label: 'Email customer',
      handler: () => {
        if (customer.email) {
          window.open(`mailto:${customer.email}`)
        }
      },
    },
  ]

  return (
    <InternalPageContainer>
      <div className="w-full flex flex-col gap-6">
        <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
          <Breadcrumb />
          <div className="flex flex-row items-center justify-between">
            <div className="min-w-0 overflow-hidden mr-4">
              <PageHeader
                title={customer.name ?? ''}
                className="truncate whitespace-nowrap overflow-hidden text-ellipsis"
              />
            </div>
            <div className="flex flex-row gap-2 justify-end flex-shrink-0">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-fit p-1" align="end">
                  <PopoverMenu items={moreMenuItems} />
                </PopoverContent>
              </Popover>
              <Button onClick={() => setIsEditOpen(true)}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </div>
          </div>
        </div>
        <div className="pt-6">
          <CustomerBillingSubPage
            customer={customer}
            payments={payments}
            usageEvents={usageEvents}
          />
        </div>
      </div>
      <EditCustomerModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        customer={customer}
      />
      <MigrateCustomerPricingModelModal
        isOpen={isMigrateOpen}
        setIsOpen={setIsMigrateOpen}
        customer={customer}
      />
    </InternalPageContainer>
  )
}

export default InternalCustomerDetailsScreen
