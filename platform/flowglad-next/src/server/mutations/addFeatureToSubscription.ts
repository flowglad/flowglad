import { protectedProcedure } from '@/server/trpc'
import { authenticatedProcedureComprehensiveTransaction } from '@/db/authenticatedTransaction'
import { addFeatureToSubscriptionInputSchema } from '@/db/schema/subscriptionItemFeatures'
import { addFeatureToSubscriptionItem } from '@/subscriptions/subscriptionItemFeatureHelpers'
import { selectClientSubscriptionItemFeatureAndFeatureById } from '@/db/tableMethods/subscriptionItemFeatureMethods'

export const addFeatureToSubscription = protectedProcedure
  .input(addFeatureToSubscriptionInputSchema)
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, transaction }) => {
        const { result, ledgerCommand } =
          await addFeatureToSubscriptionItem(input, transaction)

        const [enrichedFeature] =
          await selectClientSubscriptionItemFeatureAndFeatureById(
            result.subscriptionItemFeature.id,
            transaction
          )

        if (!enrichedFeature) {
          throw new Error(
            `Failed to load subscription item feature ${result.subscriptionItemFeature.id} after creation.`
          )
        }

        return {
          result: { subscriptionItemFeature: enrichedFeature },
          ledgerCommand,
        }
      }
    )
  )
