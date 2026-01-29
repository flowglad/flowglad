'use client'

import { MembershipRole } from '@db-core/enums'
import type { ColumnDef } from '@tanstack/react-table'
import { sentenceCase } from 'change-case'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
// UI components
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import type { Membership } from '@/db/schema/memberships'
// Other imports
import type { User } from '@/db/schema/users'

export type OrganizationMemberTableRowData = {
  user: User.Record
  membership: Membership.ClientRecord
}

/**
 * Meta context passed to the table for role-based actions
 */
export interface OrganizationMemberTableMeta {
  currentMembership: Membership.ClientRecord | null
  onRemoveMember: (member: OrganizationMemberTableRowData) => void
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
  {
    id: 'role',
    accessorFn: (row) => row.membership.role,
    header: 'Role',
    cell: ({ row }) => {
      const role = row.original.membership.role
      return (
        <Badge
          variant={
            role === MembershipRole.Owner ? 'default' : 'secondary'
          }
        >
          {sentenceCase(role)}
        </Badge>
      )
    },
    size: 100,
    minSize: 80,
    maxSize: 150,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row, table }) => {
      const meta = table.options.meta as
        | OrganizationMemberTableMeta
        | undefined
      if (!meta?.currentMembership) {
        return null
      }

      const currentMembership = meta.currentMembership
      const targetMembership = row.original.membership

      const isCurrentUserOwner =
        currentMembership.role === MembershipRole.Owner
      const isTargetOwner =
        targetMembership.role === MembershipRole.Owner
      const isSelf = currentMembership.id === targetMembership.id

      // Determine if we should show a remove/leave button
      // - Owner can remove any non-owner member
      // - Member can only leave (remove themselves)
      // - Cannot remove an owner
      const canRemove =
        isCurrentUserOwner && !isTargetOwner && !isSelf
      const canLeave = isSelf && !isTargetOwner

      if (!canRemove && !canLeave) {
        return null
      }

      const handleClick = () => {
        meta.onRemoveMember(row.original)
      }

      return (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClick}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            {canLeave ? 'Leave' : 'Remove'}
          </Button>
        </div>
      )
    },
    size: 100,
    minSize: 80,
    maxSize: 150,
  },
]
