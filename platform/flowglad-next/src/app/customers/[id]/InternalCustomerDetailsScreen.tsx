'use client'
import { Archive, Mail, Pencil, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import ArchiveCustomerModal from '@/components/forms/ArchiveCustomerModal'
import EditCustomerModal from '@/components/forms/EditCustomerModal'
import MigrateCustomerPricingModelModal from '@/components/forms/MigrateCustomerPricingModelModal'
import { MoreIcon } from '@/components/icons/MoreIcon'
import PageContainer from '@/components/PageContainer'
import PopoverMenu, {
  type PopoverMenuItem,
  PopoverMenuItemState,
} from '@/components/PopoverMenu'
import { CopyableField } from '@/components/ui/copyable-field'
import { PageHeaderNew } from '@/components/ui/page-header-new'
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
  const router = useRouter()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isMigrateOpen, setIsMigrateOpen] = useState(false)
  const [isArchiveOpen, setIsArchiveOpen] = useState(false)
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)

  const isArchived = customer.archived

  const moreMenuItems: PopoverMenuItem[] = [
    {
      label: 'Edit',
      handler: () => {
        setIsMoreMenuOpen(false)
        setIsEditOpen(true)
      },
      icon: <Pencil className="h-4 w-4" />,
      disabled: isArchived,
    },
    {
      label: 'Migrate Pricing Model',
      handler: () => {
        setIsMoreMenuOpen(false)
        setIsMigrateOpen(true)
      },
      icon: <RefreshCw className="h-4 w-4" />,
      disabled: isArchived,
    },
    ...(customer.email
      ? [
          {
            label: 'Email customer',
            handler: () => {
              setIsMoreMenuOpen(false)
              window.open(`mailto:${customer.email}`)
            },
            icon: <Mail className="h-4 w-4" />,
          },
        ]
      : []),
    {
      label: 'Archive Customer',
      handler: () => {
        setIsMoreMenuOpen(false)
        setIsArchiveOpen(true)
      },
      icon: <Archive className="h-4 w-4" />,
      disabled: isArchived,
      helperText: isArchived
        ? 'Customer is already archived'
        : undefined,
      state: PopoverMenuItemState.Danger,
    },
  ]

  return (
    <PageContainer>
      <div className="w-full relative flex flex-col justify-center pb-6">
        <PageHeaderNew
          title={customer.name ?? ''}
          breadcrumb="Customers"
          onBreadcrumbClick={() => router.push('/customers')}
          className="pb-4"
          badges={[
            ...(isArchived
              ? [
                  {
                    icon: <Archive className="h-3.5 w-3.5" />,
                    label: 'Archived',
                    variant: 'destructive' as const,
                  },
                ]
              : []),
            ...(customer.email
              ? [
                  {
                    icon: <Mail className="h-3.5 w-3.5" />,
                    label: customer.email,
                    variant: 'muted' as const,
                  },
                ]
              : []),
          ]}
          description={
            <div className="flex items-center gap-2">
              <CopyableField
                value={customer.id}
                label="ID"
                displayText="Copy ID"
              />
              <div className="h-[22px] w-px bg-muted-foreground opacity-10" />
              <Popover
                open={isMoreMenuOpen}
                onOpenChange={setIsMoreMenuOpen}
              >
                <PopoverTrigger asChild>
                  <div
                    className="inline-flex items-center gap-1 cursor-pointer group"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setIsMoreMenuOpen(true)
                      }
                    }}
                    aria-label="More options"
                  >
                    <MoreIcon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground flex-shrink-0 transition-colors" />
                    <span className="font-sans font-medium text-sm leading-5 text-muted-foreground group-hover:underline group-hover:text-foreground transition-colors">
                      More options
                    </span>
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-fit p-1" align="start">
                  <PopoverMenu items={moreMenuItems} />
                </PopoverContent>
              </Popover>
            </div>
          }
        />

        <CustomerBillingSubPage
          customer={customer}
          payments={payments}
          usageEvents={usageEvents}
        />
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
      <ArchiveCustomerModal
        customer={customer}
        open={isArchiveOpen}
        onOpenChange={setIsArchiveOpen}
        onSuccess={() => router.push('/customers')}
      />
    </PageContainer>
  )
}

export default InternalCustomerDetailsScreen
