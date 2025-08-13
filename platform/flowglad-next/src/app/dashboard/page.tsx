// Generated with Ion on 10/31/2024, 6:10:56 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1033:8693
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import InternalDashboard from './InternalDashboard'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import { redirect } from 'next/navigation'

export default async function Home() {
  const organization = await authenticatedTransaction(
    async ({ userId, transaction }) => {
      const result = await selectFocusedMembershipAndOrganization(
        userId,
        transaction
      )
      console.log('$$$ result', result)
      if (!result || !result.organization) {
        redirect('/onboarding')
      }
      return result.organization
    }
  )
  return (
    <InternalDashboard
      organizationCreatedAt={organization.createdAt}
    />
  )
}
