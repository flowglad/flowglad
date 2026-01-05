'use client'

import type { ColumnDef } from '@tanstack/react-table'
// Icons come next
import { Trash2 } from 'lucide-react'
import * as React from 'react'
// UI components last
import DeleteApiKeyModal from '@/components/forms/DeleteApiKeyModal'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
import type { ApiKey } from '@/db/schema/apiKeys'
import { FlowgladApiKeyType } from '@/types'
// Other imports
import core from '@/utils/core'

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

  const isKeyDeleteable = apiKey.type === FlowgladApiKeyType.Secret

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
      <DeleteApiKeyModal
        isOpen={isDeleteOpen}
        setIsOpen={setIsDeleteOpen}
        id={apiKey.id}
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<ApiKeyTableRowData>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.apiKey.name,
    header: 'Name',
    cell: ({ row }) => (
      <div className="truncate" title={row.getValue('name')}>
        {row.getValue('name')}
      </div>
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
    size: 225,
    minSize: 180,
    maxSize: 300,
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
    enableResizing: false,
    cell: ({ row }) => {
      const apiKey = row.original.apiKey
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <ApiKeyActionsMenu apiKey={apiKey} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
