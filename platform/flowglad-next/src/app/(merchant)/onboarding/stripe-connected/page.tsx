import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { getConnectedAccount } from '@/utils/stripe'

const StripeConnectedPage = async () => {
  const organization = await authenticatedTransaction(
    async ({ userId, transaction }) => {
      const [membership] = await selectMembershipAndOrganizations(
        {
          userId,
          focused: true,
        },
        transaction
      )
      if (!membership || !membership.organization) {
        throw new Error('No organization found for this user')
      }
      return membership.organization
    }
  )
  if (!organization.stripeAccountId) {
    return <div>No Stripe Account ID</div>
  }
  const connectedAccount = await getConnectedAccount(
    organization.stripeAccountId,
    true
  )

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">Stripe Connected</h1>
      <p className="text-lg">
        {connectedAccount.payouts_enabled
          ? '✅ Payouts enabled'
          : '❌Payouts disabled'}
        {connectedAccount.charges_enabled
          ? '✅ Charges enabled'
          : '❌Charges disabled'}
        {connectedAccount.business_profile?.name}
        {connectedAccount.details_submitted}
      </p>
    </div>
  )
}

export default StripeConnectedPage
