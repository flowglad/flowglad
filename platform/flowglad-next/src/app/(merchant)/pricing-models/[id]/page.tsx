import { Result } from 'better-result'
import { notFound } from 'next/navigation'
import { adminTransaction } from '@/db/adminTransaction'
import { getDatabaseAuthenticationInfo } from '@/db/databaseAuthentication'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import InnerPricingModelDetailsPage from './InnerPricingModelDetailsPage'

interface PricingModelPageProps {
  params: Promise<{ id: string }>
}

/**
 * Pricing model detail page.
 *
 * Uses adminTransaction to bypass livemode RLS so users can view
 * testmode pricing models while in livemode context (and vice versa).
 * Security is enforced by filtering by organizationId from the session.
 */
const PricingModelPage = async ({
  params,
}: PricingModelPageProps) => {
  const { id } = await params

  // Get auth info to extract organizationId for security filtering
  const authInfo = await getDatabaseAuthenticationInfo({
    apiKey: undefined,
  })
  const organizationId = authInfo.jwtClaim.organization_id

  if (!organizationId) {
    notFound()
  }

  const pricingModel = (
    await adminTransaction(async ({ transaction }) => {
      const [pricingModel] = await selectPricingModels(
        { id, organizationId }, // Filter by both id AND organizationId for security
        transaction
      )
      return Result.ok(pricingModel)
    })
  ).unwrap()

  if (!pricingModel) {
    notFound()
  }

  return <InnerPricingModelDetailsPage pricingModel={pricingModel} />
}

export default PricingModelPage
