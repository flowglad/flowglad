'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// Icons come next
import { Pencil, ExternalLink, Copy } from 'lucide-react'
// UI components last
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
// Other imports
import core from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import EditCustomerModal from '@/components/forms/EditCustomerModal'
import { Customer, CustomerTableRowData } from '@/db/schema/customers'
import { CurrencyCode } from '@/types'

function CustomerActionsMenu({
  customer,
}: {
  customer: Customer.ClientRecord
}) {
  const [isEditOpen, setIsEditOpen] = React.useState(false)

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

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Edit Customer',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Copy Portal Link',
      icon: <ExternalLink className="h-4 w-4" />,
      handler: copyPortalURLHandler,
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
  ]

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <EditCustomerModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        customer={customer}
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<CustomerTableRowData>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.customer.name,
    header: 'Name',
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue('name')}</div>
    ),
    size: 150,
    minSize: 120,
    maxSize: 200,
  },
  {
    id: 'email',
    accessorFn: (row) => row.customer.email,
    header: 'Email',
    cell: ({ row }) => (
      <div className="lowercase truncate">
        {row.getValue('email')}
      </div>
    ),
    size: 200,
    minSize: 150,
    maxSize: 300,
  },
  {
    accessorKey: 'totalSpend',
    header: 'Total Spend',
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue('totalSpend') || '0')
      const formatted =
        stripeCurrencyAmountToHumanReadableCurrencyAmount(
          CurrencyCode.USD,
          amount
        )
      return <div className="font-medium">{formatted}</div>
    },
    size: 100,
    minSize: 80,
    maxSize: 120,
  },
  {
    accessorKey: 'payments',
    header: 'Payments',
    cell: ({ row }) => <div>{row.getValue('payments') || 0}</div>,
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
    size: 125,
    minSize: 125,
    maxSize: 150,
  },
  {
    id: 'customerId',
    accessorFn: (row) => row.customer.id,
    header: 'ID',
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell copyText={row.getValue('customerId')}>
          {row.getValue('customerId')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 180,
    minSize: 125,
    maxSize: 250,
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => {
      const customer = row.original.customer
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <CustomerActionsMenu customer={customer} />
        </div>
      )
    },
    size: 40,
    maxSize: 40,
  },
]
