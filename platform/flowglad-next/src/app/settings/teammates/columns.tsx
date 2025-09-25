'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// Other imports
import { User } from '@/db/schema/users'
import { Membership } from '@/db/schema/memberships'

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
      <div className="font-medium">{row.getValue('name')}</div>
    ),
  },
  {
    id: 'email',
    accessorFn: (row) => row.user.email,
    header: 'Email',
    cell: ({ row }) => (
      <div className="text-muted-foreground">
        {row.getValue('email')}
      </div>
    ),
  },
]
