'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// Icons come next
import { Trash2 } from 'lucide-react'
// UI components last
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
// Other imports
import core from '@/utils/core'
import { ApiKey } from '@/db/schema/apiKeys'
import { FlowgladApiKeyType } from '@/types'

export type ApiKeyTableRowData = {
  apiKey: ApiKey.ClientRecord
  organization: { id: string; name: string }
}

function ApiKeyActionsMenu({
  apiKey,
}: {
  apiKey: ApiKey.ClientRecord
}) {
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)

  const isKeyDeleteable =
    apiKey.livemode && apiKey.type === FlowgladApiKeyType.Secret

  const actionItems: ActionMenuItem[] = []

  if (isKeyDeleteable) {
    actionItems.push({
      label: 'Delete API Key',
      icon: <Trash2 className="h-4 w-4" />,
      handler: () => setIsDeleteOpen(true),
      destructive: true,
    })
  }

  // If no actions available, don't render the menu
  if (actionItems.length === 0) {
    return null
  }

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      {/* Add delete modal here when needed */}
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<ApiKeyTableRowData>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.apiKey.name,
    header: 'Name',
    cell: ({ row }) => (
      <div className="truncate max-w-24">{row.getValue('name')}</div>
    ),
    size: 150,
    minSize: 120,
    maxSize: 200,
  },
  {
    id: 'token',
    accessorFn: (row) => row.apiKey.token,
    header: 'Token',
    cell: ({ row }) => {
      const apiKey = row.original.apiKey
      // Only allow copying for non-live tokens
      if (apiKey.livemode) {
        return (
          <div className="font-mono text-sm">
            {row.getValue('token')}
          </div>
        )
      }
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DataTableCopyableCell copyText={row.getValue('token')}>
            {row.getValue('token')}
          </DataTableCopyableCell>
        </div>
      )
    },
    size: 300,
    minSize: 250,
    maxSize: 400,
  },
  {
    id: 'createdAt',
    accessorFn: (row) => row.apiKey.createdAt,
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
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => {
      const apiKey = row.original.apiKey
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <ApiKeyActionsMenu apiKey={apiKey} />
        </div>
      )
    },
    size: 40,
    maxSize: 40,
  },
]
