'use client'
import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import Table from '@/components/ion/Table'
import { Purchase } from '@/db/schema/purchases'
import core from '@/utils/core'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import {
  PopoverMenuItemState,
  type PopoverMenuItem,
} from '@/components/PopoverMenu'
import Badge, { BadgeColor } from '@/components/ion/Badge'
import TableTitle from '@/components/ion/TableTitle'
import EndPurchaseModal from '@/components/forms/EndPurchaseModal'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import { Payment } from '@/db/schema/payments'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { CurrencyCode } from '@/types'

const MoreMenuCell = ({
  purchase,
}: {
  purchase: Purchase.ClientRecord
}) => {
  const [isEndOpen, setIsEndOpen] = useState(false)
  const items: PopoverMenuItem[] = []

  if (!purchase.endDate) {
    if (purchase.purchaseDate) {
      items.push({
        label: 'End Purchase',
        handler: () => setIsEndOpen(true),
        state: PopoverMenuItemState.Danger,
        disabled: !purchase.purchaseDate,
        helperText: purchase.purchaseDate
          ? undefined
          : 'Cannot end a purchase that has not started',
      })
    }
  }

  return (
    <>
      <EndPurchaseModal
        isOpen={isEndOpen}
        setIsOpen={setIsEndOpen}
        purchase={purchase}
      />
      <TableRowPopoverMenu items={items} />
    </>
  )
}

const PurchaseStatusCell = ({
  purchase,
}: {
  purchase: Purchase.ClientRecord
}) => {
  let badgeLabel: string = 'Pending'
  let badgeColor: BadgeColor = 'grey'

  if (purchase.endDate) {
    badgeColor = 'grey'
    badgeLabel = 'Concluded'
  } else if (purchase.purchaseDate) {
    badgeColor = 'green'
    badgeLabel = 'Paid'
  } else {
    badgeColor = 'grey'
    badgeLabel = 'Pending'
  }

  return <Badge color={badgeColor}>{badgeLabel}</Badge>
}

const PurchasesTable = ({
  purchases,
  payments,
}: {
  purchases: Purchase.ClientRecord[]
  payments: Payment.ClientRecord[]
}) => {
  const [createPurchaseModalOpen, setCreatePurchaseModalOpen] =
    useState(false)
  const paymentsByPurchaseId = useMemo(
    () => new Map<string, Payment.ClientRecord[]>(),
    []
  )
  payments.forEach((payment) => {
    paymentsByPurchaseId.set(payment.PurchaseId ?? '-1', [payment])
  })
  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Name" column={column} />
          ),
          accessorKey: 'name',
          cell: ({ row: { original: cellData } }) => {
            return (
              <span className="text-sm font-medium w-[25ch] truncate">
                {cellData.name}
              </span>
            )
          },
        },
        {
          header: 'Status',
          accessorKey: 'status',
          cell: ({ row: { original: cellData } }) => {
            return <PurchaseStatusCell purchase={cellData} />
          },
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Revenue"
              column={column}
            />
          ),
          accessorKey: 'amount',
          cell: ({ row: { original: cellData } }) => (
            <>
              <span className="text-sm">
                {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                  CurrencyCode.USD,
                  paymentsByPurchaseId
                    .get(cellData.id)
                    ?.reduce(
                      (acc, payment) => acc + payment.amount,
                      0
                    ) ?? 0
                )}
              </span>
            </>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Purchase Date"
              column={column}
            />
          ),
          accessorKey: 'startDate',
          cell: ({ row: { original: cellData } }) => (
            <>
              {cellData.purchaseDate
                ? core.formatDate(cellData.purchaseDate)
                : '-'}
            </>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Created"
              column={column}
            />
          ),
          accessorKey: 'createdAt',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.createdAt)}</>
          ),
        },
        {
          id: '_',
          cell: ({ row: { original: cellData } }) => (
            <div
              className="w-fit"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreMenuCell purchase={cellData} />
            </div>
          ),
        },
      ] as ColumnDef<Purchase.ClientRecord>[],
    [paymentsByPurchaseId]
  )

  return (
    <div className="w-full flex flex-col gap-5">
      <TableTitle
        title="Purchases"
        noButtons
        // buttonLabel="Create Purchase"
        // buttonIcon={<Plus size={8} strokeWidth={2} />}
        // buttonOnClick={() => setCreatePurchaseModalOpen(true)}
      />
      <div className="w-full flex flex-col gap-5 pb-20">
        <Table
          columns={columns}
          data={purchases}
          className="bg-nav w-full"
          bordered
        />
      </div>
    </div>
  )
}

export default PurchasesTable
