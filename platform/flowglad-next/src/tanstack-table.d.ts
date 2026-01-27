import type { RowData } from '@tanstack/table-core'
import type { Membership } from '@/db/schema/memberships'
import type { User } from '@/db/schema/users'

type OrganizationMemberTableRowData = {
  user: User.Record
  membership: Membership.ClientRecord
}

declare module '@tanstack/table-core' {
  interface TableMeta<TData extends RowData> {
    currentMembership: Membership.ClientRecord | null
    onRemoveMember: (member: OrganizationMemberTableRowData) => void
  }
}
