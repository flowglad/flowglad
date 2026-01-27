'use client'

import type { ColumnDef } from '@tanstack/react-table'
import * as React from 'react'
// UI components
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import type { Membership } from '@/db/schema/memberships'
// Other imports
import type { User } from '@/db/schema/users'

export type OrganizationMemberTableRowData = {
  user: User.Record
  membership: Membership.ClientRecord
}

export const columns: ColumnDef<OrganizationMemberTableRowData>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.user.name,
    header: 'Name',
    cell: ({ row }) => (
      <div className="truncate" title={row.getValue('name')}>
        {row.getValue('name')}
      </div>
    ),
    size: 200,
    minSize: 150,
    maxSize: 300,
  },
  {
    id: 'email',
    accessorFn: (row) => row.user.email,
    header: 'Email',
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell
          copyText={row.getValue('email')}
          className="lowercase"
        >
          {row.getValue('email')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 250,
    minSize: 200,
    maxSize: 350,
  },
]
