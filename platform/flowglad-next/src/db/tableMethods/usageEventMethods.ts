import { eq, inArray } from 'drizzle-orm'
import {
  customerClientSelectSchema,
  customers,
} from '@/db/schema/customers'
import { prices, pricesClientSelectSchema } from '@/db/schema/prices'
import { products } from '@/db/schema/products'
import {
  subscriptionClientSelectSchema,
  subscriptions,
} from '@/db/schema/subscriptions'
import {
  type UsageEvent,
  usageEvents,
  usageEventsInsertSchema,
  usageEventsSelectSchema,
  usageEventsTableRowDataSchema,
  usageEventsUpdateSchema,
} from '@/db/schema/usageEvents'
import {
  usageMeters,
  usageMetersClientSelectSchema,
} from '@/db/schema/usageMeters'
import {
  createBulkInsertOrDoNothingFunction,
  createCursorPaginatedSelectFunction,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { SubscriptionStatus } from '@/types'
import core from '@/utils/core'
import type { DbTransaction } from '../types'
import { isSubscriptionCurrent } from './subscriptionMethods'

const config: ORMMethodCreatorConfig<
  typeof usageEvents,
  typeof usageEventsSelectSchema,
  typeof usageEventsInsertSchema,
  typeof usageEventsUpdateSchema
> = {
  selectSchema: usageEventsSelectSchema,
  insertSchema: usageEventsInsertSchema,
  updateSchema: usageEventsUpdateSchema,
  tableName: 'usage_events',
}

export const selectUsageEventById = createSelectById(
  usageEvents,
  config
)

export const insertUsageEvent = createInsertFunction(
  usageEvents,
  config
)

export const updateUsageEvent = createUpdateFunction(
  usageEvents,
  config
)

export const selectUsageEvents = createSelectFunction(
  usageEvents,
  config
)

const bulkInsertOrDoNothingUsageEvents =
  createBulkInsertOrDoNothingFunction(usageEvents, config)

export const bulkInsertOrDoNothingUsageEventsByTransactionId = (
  usageEventInserts: UsageEvent.Insert[],
  transaction: DbTransaction
) => {
  return bulkInsertOrDoNothingUsageEvents(
    usageEventInserts,
    [usageEvents.transactionId, usageEvents.usageMeterId],
    transaction
  )
}

// Paginated select function for basic usage events
export const selectUsageEventsPaginated =
  createPaginatedSelectFunction(usageEvents, config)

// Cursor paginated select function for table rows with joins
export const selectUsageEventsTableRowData =
  createCursorPaginatedSelectFunction(
    usageEvents,
    config,
    usageEventsTableRowDataSchema,
    async (
      usageEventsData: UsageEvent.Record[],
      transaction: DbTransaction
    ) => {
      const customerIds = usageEventsData
        .map((usageEvent) => usageEvent.customerId)
        .filter((id): id is string => id !== null)

      const subscriptionIds = usageEventsData
        .map((usageEvent) => usageEvent.subscriptionId)
        .filter((id): id is string => id !== null)

      const usageMeterIds = usageEventsData
        .map((usageEvent) => usageEvent.usageMeterId)
        .filter((id): id is string => id !== null)

      const priceIds = usageEventsData
        .map((usageEvent) => usageEvent.priceId)
        .filter((id): id is string => !core.isNil(id))

      // Query 1: Get customers
      const customerResults = await transaction
        .select()
        .from(customers)
        .where(inArray(customers.id, customerIds))

      // Query 2: Get subscriptions
      const subscriptionResults = await transaction
        .select()
        .from(subscriptions)
        .where(inArray(subscriptions.id, subscriptionIds))

      // Query 3: Get usage meters
      const usageMeterResults = await transaction
        .select()
        .from(usageMeters)
        .where(inArray(usageMeters.id, usageMeterIds))

      // Query 4: Get prices with products
      const priceResults = await transaction
        .select({
          price: prices,
          product: products,
        })
        .from(prices)
        .innerJoin(products, eq(products.id, prices.productId))
        .where(inArray(prices.id, priceIds))

      // Create lookup maps
      const customersById = new Map(
        customerResults.map((customer) => [customer.id, customer])
      )
      const subscriptionsById = new Map(
        subscriptionResults.map((subscription) => [
          subscription.id,
          subscription,
        ])
      )
      const usageMetersById = new Map(
        usageMeterResults.map((usageMeter) => [
          usageMeter.id,
          usageMeter,
        ])
      )
      const pricesById = new Map(
        priceResults.map((result) => [result.price.id, result.price])
      )
      const productsById = new Map(
        priceResults.map((result) => [
          result.product.id,
          result.product,
        ])
      )

      return usageEventsData.map((usageEvent) => {
        const customer = customersById.get(usageEvent.customerId)
        const subscription = subscriptionsById.get(
          usageEvent.subscriptionId
        )
        const usageMeter = usageMetersById.get(
          usageEvent.usageMeterId
        )
        const price = usageEvent.priceId
          ? pricesById.get(usageEvent.priceId)
          : null

        if (!customer || !subscription || !usageMeter) {
          throw new Error(
            `Missing related data for usage event ${usageEvent.id}`
          )
        }
        // pricesById only contains prices that passed the INNER JOIN with products.
        // If priceId exists but price is missing, the price's product doesn't exist (data integrity issue).
        if (usageEvent.priceId && !price) {
          throw new Error(
            `Price not found for usage event ${usageEvent.id} with priceId ${usageEvent.priceId}`
          )
        }

        // Transform database records to client records
        const customerClient =
          customerClientSelectSchema.parse(customer)
        const subscriptionWithCurrent = {
          ...subscription,
          current: isSubscriptionCurrent(
            subscription.status as SubscriptionStatus,
            subscription.cancellationReason
          ),
        }
        const subscriptionClient =
          subscriptionClientSelectSchema.parse(
            subscriptionWithCurrent
          )
        const usageMeterClient =
          usageMetersClientSelectSchema.parse(usageMeter)
        const priceClient = price
          ? pricesClientSelectSchema.parse(price)
          : null

        return {
          usageEvent,
          customer: customerClient,
          subscription: subscriptionClient,
          usageMeter: usageMeterClient,
          price: priceClient,
        }
      })
    }
  )
