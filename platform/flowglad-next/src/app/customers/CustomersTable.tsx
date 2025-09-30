import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import {
  Customer,
  InferredCustomerStatus,
  CustomerTableRowData,
} from '@/db/schema/customers'
import core from '@/utils/core'
import { Badge } from '@/components/ui/badge'
import { sentenceCase } from 'change-case'
import { trpc } from '@/app/_trpc/client'
import { useRouter } from 'next/navigation'
import { CurrencyCode } from '@/types'
import { Input } from '@/components/ui/input'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import EditCustomerModal from '@/components/forms/EditCustomerModal'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { useCopyTextHandler } from '../hooks/useCopyTextHandler'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { SearchIcon, Pencil, ExternalLink, Copy } from 'lucide-react'
import debounce from 'debounce'

const customerStatusColors: Record<InferredCustomerStatus, string> = {
  [InferredCustomerStatus.Active]: 'bg-green-100 text-green-800',
  [InferredCustomerStatus.Archived]: 'bg-red-100 text-red-800',
  [InferredCustomerStatus.Pending]: 'bg-yellow-100 text-yellow-800',
  [InferredCustomerStatus.Concluded]: 'bg-gray-100 text-gray-800',
  [InferredCustomerStatus.PastDue]: 'bg-red-100 text-red-800',
}

const CustomerStatusCell = ({
  status,
}: {
  status: InferredCustomerStatus
}) => {
  return (
    <Badge
      variant="secondary"
      className={customerStatusColors[status]}
    >
      {sentenceCase(status)}
    </Badge>
  )
}

const CustomerMoreMenuCell = ({
  customer,
}: {
  customer: Customer.ClientRecord
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
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
  const basePopoverMenuItems = [
    {
      label: 'Edit Customer',
      icon: <Pencil />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Copy Portal Link',
      icon: <ExternalLink />,
      handler: copyPortalURLHandler,
    },
    {
      label: 'Copy External ID',
      icon: <Copy />,
      handler: copyExternalIDHandler,
    },
    {
      label: 'Copy ID',
      icon: <Copy />,
      handler: copyIDHandler,
    },
  ]

  return (
    <MoreMenuTableCell items={basePopoverMenuItems}>
      <EditCustomerModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        customer={customer}
      />
    </MoreMenuTableCell>
  )
}

export interface CustomersTableFilters {
  archived?: boolean
  organizationId?: string
  pricingModelId?: string
}

const CustomersTable = ({
  filters = {},
}: {
  filters?: CustomersTableFilters
}) => {
  const router = useRouter()
  const [innerSearch, setInnerSearch] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSetSearch = debounce(setSearch, 500)

  useEffect(() => {
    debouncedSetSearch(innerSearch)
  }, [innerSearch, debouncedSetSearch])

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    CustomerTableRowData,
    CustomersTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters,
    searchQuery: search,
    useQuery: trpc.customers.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          header: 'Name',
          accessorKey: 'customer.name',
          size: 150,
          minSize: 120,
          maxSize: 150,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.customer.name}</span>
          ),
        },
        {
          header: 'Email',
          accessorKey: 'customer.email',
          size: 200,
          minSize: 150,
          maxSize: 500,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm truncate block">
              {cellData.customer.email}
            </span>
          ),
        },
        {
          header: 'Total Spend',
          accessorKey: 'totalSpend',
          size: 100,
          minSize: 80,
          maxSize: 100,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                CurrencyCode.USD,
                cellData.totalSpend || 0
              )}
            </span>
          ),
        },
        {
          header: 'Payments',
          accessorKey: 'payments',
          size: 100,
          minSize: 80,
          maxSize: 100,
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.payments || 0}</span>
          ),
        },
        {
          header: 'Created At',
          accessorKey: 'customer.createdAt',
          size: 125,
          minSize: 125,
          maxSize: 125,
          cell: ({ row: { original: cellData } }) => (
            <div
              className="w-[125px] max-w-[125px] min-w-[125px] overflow-hidden whitespace-nowrap text-ellipsis box-border"
              style={{
                width: '125px',
                maxWidth: '125px',
                minWidth: '125px',
              }}
            >
              {core.formatDate(cellData.customer.createdAt!)}
            </div>
          ),
        },
        {
          header: 'ID',
          accessorKey: 'customer.id',
          size: 180,
          minSize: 125,
          maxSize: 250,
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.customer.id}>
              {cellData.customer.id}
            </CopyableTextTableCell>
          ),
        },
        {
          id: '_',
          size: 40,
          maxSize: 40,
          cell: ({ row: { original: cellData } }) => (
            <CustomerMoreMenuCell customer={cellData.customer} />
          ),
        },
      ] as ColumnDef<CustomerTableRowData>[],
    []
  )

  const tableData = data?.items || []
  const total = data?.total || 0
  return (
    <>
      <div className="relative mb-4">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={innerSearch}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setInnerSearch(e.target.value)
          }
          placeholder="Search"
          className="pl-9"
        />
      </div>
      <DataTable
        columns={columns}
        data={tableData}
        className="bg-background"
        bordered
        pagination={{
          pageIndex,
          pageSize,
          total,
          onPageChange: handlePaginationChange,
          isLoading,
          isFetching,
        }}
        onClickRow={(row) => {
          router.push(`/customers/${row.customer.id}`)
        }}
      />
    </>
  )
}

export default CustomersTable
