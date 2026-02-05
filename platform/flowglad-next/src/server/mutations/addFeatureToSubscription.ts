import {
  addFeatureToSubscriptionInputSchema,
  subscriptionItemFeaturesClientSelectSchema,
} from '@db-core/schema/subscriptionItemFeatures'
import { Result } from 'better-result'
import { z } from 'zod'
import { authenticatedProcedureComprehensiveTransaction } from '@/db/authenticatedTransaction'
import { selectClientSubscriptionItemFeatureAndFeatureById } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { protectedProcedure } from '@/server/trpc'
import { addFeatureToSubscriptionItem } from '@/subscriptions/subscriptionItemFeatureHelpers'

const addFeatureToSubscriptionOutputSchema = z
  .object({
    subscriptionItemFeature:
      subscriptionItemFeaturesClientSelectSchema,
  })
  .meta({ id: 'AddFeatureToSubscriptionOutput' })

export const addFeatureToSubscription = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/subscriptions/{id}/add-feature',
      summary: 'Add Feature to Subscription',
      description:
        'Add a feature to a subscription. For toggle features, this is idempotent. For usage credit features, amounts accumulate. Optionally grant credits immediately for the current billing period.',
      tags: ['Subscriptions'],
      protect: true,
    },
  })
  .input(addFeatureToSubscriptionInputSchema)
  .output(addFeatureToSubscriptionOutputSchema)
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
