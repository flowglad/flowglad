import { addFeatureToSubscriptionInputSchema } from '@db-core/schema/subscriptionItemFeatures'
import { Result } from 'better-result'
import { authenticatedProcedureComprehensiveTransaction } from '@/db/authenticatedTransaction'
import { selectClientSubscriptionItemFeatureAndFeatureById } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { protectedProcedure } from '@/server/trpc'
import { addFeatureToSubscriptionItem } from '@/subscriptions/subscriptionItemFeatureHelpers'

export const addFeatureToSubscription = protectedProcedure
  .input(addFeatureToSubscriptionInputSchema)
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, transactionCtx }) => {
        const { subscriptionItemFeature } = (
          await addFeatureToSubscriptionItem(input, transactionCtx)
        ).unwrap()
        const { transaction } = transactionCtx

        const [enrichedFeature] =
          await selectClientSubscriptionItemFeatureAndFeatureById(
            subscriptionItemFeature.id,
            transaction
          )

        if (!enrichedFeature) {
          throw new Error(
            `Failed to load subscription item feature ${subscriptionItemFeature.id} after creation.`
          )
        }

        return Result.ok({ subscriptionItemFeature: enrichedFeature })
      }
    )
  )
