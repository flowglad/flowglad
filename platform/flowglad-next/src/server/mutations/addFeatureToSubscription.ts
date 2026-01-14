import { authenticatedProcedureComprehensiveTransaction } from '@/db/authenticatedTransaction'
import { addFeatureToSubscriptionInputSchema } from '@/db/schema/subscriptionItemFeatures'
import { selectClientSubscriptionItemFeatureAndFeatureById } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { protectedProcedure } from '@/server/trpc'
import { addFeatureToSubscriptionItem } from '@/subscriptions/subscriptionItemFeatureHelpers'

export const addFeatureToSubscription = protectedProcedure
  .input(addFeatureToSubscriptionInputSchema)
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({
        input,
        transaction,
        emitEvent,
        invalidateCache,
        enqueueLedgerCommand,
      }) => {
        const { subscriptionItemFeature } =
          await addFeatureToSubscriptionItem(input, {
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
          })

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

        return {
          result: { subscriptionItemFeature: enrichedFeature },
        }
      }
    )
  )
