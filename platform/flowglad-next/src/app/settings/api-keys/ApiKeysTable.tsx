import { useMemo, useState } from 'react'
import { DisplayColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import ColumnHeaderCell from '@/components/ion/ColumnHeaderCell'
import { ApiKey } from '@/db/schema/apiKeys'
import core from '@/utils/core'
import { PopoverMenuItem } from '@/components/PopoverMenu'
import { FlowgladApiKeyType } from '@/types'
import { useAuthContext } from '@/contexts/authContext'
import { trpc } from '@/app/_trpc/client'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'

const MoreMenuCell = ({
  apiKey,
}: {
  apiKey: ApiKey.ClientRecord
}) => {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const basePopoverMenuItems: PopoverMenuItem[] = [
    // {
    //   label: 'New Purchase',
    //   handler: () => setIsNewPurchaseOpen(true),
    // },
  ]
  const isKeyDeleteable =
    apiKey.livemode && apiKey.type === FlowgladApiKeyType.Secret
  if (isKeyDeleteable) {
    basePopoverMenuItems.push({
      label: 'Delete API Key',
      handler: () => setIsDeleteOpen(true),
    })
  }
  return <MoreMenuTableCell items={[...basePopoverMenuItems]} />
}

const ApiKeyTokenCell = ({
  apiKey,
}: {
  apiKey: ApiKey.ClientRecord
}) => {
  if (apiKey.livemode) {
    return <span className="text-sm">{apiKey.token}</span>
  }
  return (
    <CopyableTextTableCell copyText={apiKey.token}>
      {apiKey.token}
    </CopyableTextTableCell>
  )
}

export interface ApiKeysTableFilters {
  type?: FlowgladApiKeyType
  organizationId?: string
}

const ApiKeysTable = ({
  filters = {},
}: {
  filters?: ApiKeysTableFilters
}) => {
  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    {
      apiKey: ApiKey.ClientRecord
      organization: { id: string; name: string }
    },
    ApiKeysTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters,
    useQuery: trpc.apiKeys.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <ColumnHeaderCell
              title="Name"
              column={column}
              className="w-24"
            />
          ),
          id: 'name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm w-24 truncate">
              {cellData.apiKey.name}
            </span>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Token" column={column} />
          ),
          accessorKey: 'token',
          cell: ({ row: { original: cellData } }) => {
            return <ApiKeyTokenCell apiKey={cellData.apiKey} />
          },
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Created" column={column} />
          ),
          accessorKey: 'createdAt',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.apiKey.createdAt!)}</>
          ),
        },
        // {
        //   header: () => <div />,
        //   id: 'actions',
        //   cell: ({ row: { original: cellData } }) => (
        //     <MoreMenuCell apiKey={cellData.apiKey} />
        //   ),
        // },
      ] as DisplayColumnDef<{
        apiKey: ApiKey.ClientRecord
        organization: { id: string; name: string }
      }>[],
    []
  )

  const tableData = data?.items || []
  const total = data?.total || 0

  return (
    <div className="w-full flex flex-col gap-5 pb-8">
      <div className="w-full flex flex-col gap-2">
        <div className="w-full flex flex-col gap-2">
          <div className="w-full flex flex-col gap-5">
            <Table
              columns={columns}
              data={tableData}
              className="bg-nav"
              bordered
              pagination={{
                pageIndex,
                pageSize,
                total,
                onPageChange: handlePaginationChange,
                isLoading,
                isFetching,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ApiKeysTable
