import { trpc } from '@/app/_trpc/client'
import OrganizationMembersTable from './OrganizationMembersTable'

const TeammatesSettingsTab = () => {
  const { data, isPending } = trpc.organizations.getMembers.useQuery()
  return (
    <OrganizationMembersTable
      loading={isPending}
      data={data?.members ?? []}
    />
  )
}

export default TeammatesSettingsTab
