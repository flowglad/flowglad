'use client'

import type { ColumnDef } from '@tanstack/react-table'
// Icons come next
import {
  Archive,
  ArrowRightLeft,
  Copy,
  ExternalLink,
  Pencil,
} from 'lucide-react'
import * as React from 'react'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import ArchiveCustomerModal from '@/components/forms/ArchiveCustomerModal'
import EditCustomerModal from '@/components/forms/EditCustomerModal'
import MigrateCustomerPricingModelModal from '@/components/forms/MigrateCustomerPricingModelModal'
import { Badge } from '@/components/ui/badge'
// UI components last
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
import type {
  Customer,
  CustomerTableRowData,
} from '@/db/schema/customers'
import { CurrencyCode } from '@/types'
// Other imports
import core from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

function getPortalLinkHelperText(
  isArchived: boolean,
  livemode: boolean
): string | undefined {
  if (isArchived) {
    return 'Archived customers cannot access the billing portal'
  }
  if (!livemode) {
    return 'Only livemode customers can access the billing portal'
  }
  return undefined
}

function CustomerActionsMenu({
  customer,
}: {
  customer: Customer.ClientRecord
}) {
  const [isEditOpen, setIsEditOpen] = React.useState(false)
  const [isMigrateOpen, setIsMigrateOpen] = React.useState(false)
  const [isArchiveOpen, setIsArchiveOpen] = React.useState(false)

  const billingPortalURL = core.customerBillingPortalURL({
    organizationId: customer.organizationId,
    customerId: customer.id,
  })

  const copyPortalURLHandler = useCopyTextHandler({
    text: billingPortalURL,
  })
  const copyIDHandler = useCopyTextHandler({
    text: customer.id,
  })
  const copyExternalIDHandler = useCopyTextHandler({
    text: customer.externalId,
  })

  const isArchived = customer.archived

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Edit',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
      disabled: isArchived,
      helperText: isArchived
        ? 'Cannot edit archived customers'
        : undefined,
    },
    {
      label: 'Migrate Pricing Model',
      icon: <ArrowRightLeft className="h-4 w-4" />,
      handler: () => setIsMigrateOpen(true),
      disabled: isArchived,
      helperText: isArchived
        ? 'Cannot migrate archived customers'
        : undefined,
    },
    {
      label: 'Copy Portal Link',
      icon: <ExternalLink className="h-4 w-4" />,
      handler: copyPortalURLHandler,
      disabled: !customer.livemode || isArchived,
      helperText: getPortalLinkHelperText(
        isArchived,
        customer.livemode
      ),
    },
    {
      label: 'Copy External ID',
      icon: <Copy className="h-4 w-4" />,
      handler: copyExternalIDHandler,
    },
    {
      label: 'Copy Customer ID',
      icon: <Copy className="h-4 w-4" />,
      handler: copyIDHandler,
    },
    {
      label: 'Archive Customer',
      icon: <Archive className="h-4 w-4" />,
      handler: () => setIsArchiveOpen(true),
      disabled: isArchived,
      helperText: isArchived
        ? 'Customer is already archived'
        : undefined,
      destructive: true,
    },
  ]

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
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
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<CustomerTableRowData>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.customer.name,
    header: 'Customer',
    cell: ({ row }) => {
      const isArchived = row.original.customer.archived
      return (
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`truncate ${isArchived ? 'text-muted-foreground' : ''}`}
            title={row.getValue('name')}
          >
            {row.getValue('name')}
          </span>
          {isArchived && (
            <Badge
              variant="secondary"
              className="text-xs flex-shrink-0"
            >
              Archived
            </Badge>
          )}
        </div>
      )
    },
    size: 160,
    minSize: 160,
    maxSize: 275,
  },
  {
    id: 'email',
    accessorFn: (row) => row.customer.email,
    header: 'Email',
    cell: ({ row }) => (
      <div>
        <DataTableCopyableCell
          copyText={row.getValue('email')}
          className="lowercase"
        >
          {row.getValue('email')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 210,
    minSize: 80,
    maxSize: 250,
  },
  {
    accessorKey: 'totalSpend',
    header: () => <div className="text-right">Total Spend</div>,
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue('totalSpend') || '0')
      const formatted =
        stripeCurrencyAmountToHumanReadableCurrencyAmount(
          CurrencyCode.USD,
          amount
        )
      return (
        <div className="whitespace-nowrap text-right">
          {formatted}
        </div>
      )
    },
    size: 120,
    minSize: 80,
    maxSize: 120,
  },
  {
    accessorKey: 'payments',
    header: 'Payments',
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        {row.getValue('payments') || 0}
      </div>
    ),
    size: 100,
    minSize: 80,
    maxSize: 100,
  },
  {
    id: 'createdAt',
    accessorFn: (row) => row.customer.createdAt,
    header: 'Created',
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        {core.formatDate(row.getValue('createdAt'))}
      </div>
    ),
    size: 100,
    minSize: 100,
    maxSize: 150,
  },
  {
    id: 'customerId',
    accessorFn: (row) => row.customer.id,
    header: 'ID',
    cell: ({ row }) => (
      <div>
        <DataTableCopyableCell copyText={row.getValue('customerId')}>
          {row.getValue('customerId')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 120, // SMALLER: Gets minimal extra space
    minSize: 80,
    maxSize: 180, // Reduced max to keep constrained
  },
  {
    id: 'actions',
    enableHiding: false,
    enableResizing: false,
    cell: ({ row }) => {
      const customer = row.original.customer
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <CustomerActionsMenu customer={customer} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
