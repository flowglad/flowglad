/* Example script with targeted environment
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/migrateStripeAccountToFlowglad.ts stripe_key=sk_..
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import Stripe from 'stripe'
import {
  stripeCustomerToCustomerInsert,
  stripePriceToPriceInsert,
  stripeProductToProductInsert,
  stripeSubscriptionItemToSubscriptionItemInsert,
  stripeSubscriptionToSubscriptionInsert,
} from '@/migration-helpers/stripeMigrations'
import { selectDefaultCatalog } from '@/db/tableMethods/catalogMethods'
import {
  bulkInsertOrDoNothingProducts,
  bulkInsertOrDoNothingProductsByExternalId,
} from '@/db/tableMethods/productMethods'
import core from '@/utils/core'
import { stripeIdFromObjectOrId } from '@/utils/stripe'
import { Price } from '@/db/schema/prices'
import {
  bulkInsertOrDoNothingPricesByExternalId,
  selectPrices,
} from '@/db/tableMethods/priceMethods'
import { bulkInsertOrDoNothingCustomersByStripeCustomerId } from '@/db/tableMethods/customerMethods'
import { Customer } from '@/db/schema/customers'
import { Product } from '@/db/schema/products'
import { Subscription } from '@/db/schema/subscriptions'
import {
  bulkInsertOrDoNothingSubscriptionsByExternalId,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { bulkInsertOrDoNothingSubscriptionItemsByExternalId } from '@/db/tableMethods/subscriptionItemMethods'

const getAllStripeRecords = async <
  T extends { id: string },
  P extends Stripe.PaginationParams,
>(
  listMethod: (params: P) => Stripe.ApiListPromise<T>
) => {
  const records: T[] = []
  let hasMore = true
  /**
   * @description The last product id that was fetched
   */
  let startingAfter: string | undefined
  while (hasMore) {
    // @ts-expect-error
    const iterator = await listMethod({
      limit: 100,
      starting_after: startingAfter,
    })
    for await (const record of iterator.data) {
      records.push(record)
    }
    hasMore = iterator.has_more
    startingAfter = iterator.data[iterator.data.length - 1].id
  }
  return records
}

async function example(db: PostgresJsDatabase) {
  // Get the stripe key from command line arguments
  const args = process.argv.slice(2)
  const stripeKeyArg = args.find((arg) =>
    arg.startsWith('stripe_key=')
  )

  if (!stripeKeyArg) {
    console.error('Error: stripe_key argument is required')
    console.error(
      'Usage: NODE_ENV=production pnpm tsx src/scripts/migrateStripeAccountToFlowglad.ts stripe_key=sk_...'
    )
    process.exit(1)
  }

  const stripeKey = stripeKeyArg.split('=')[1]
  const flowgladOrganizationIdArg = args.find((arg) =>
    arg.startsWith('flowglad_organization_id=')
  )
  const flowgladOrganizationId = flowgladOrganizationIdArg
    ? flowgladOrganizationIdArg.split('=')[1]
    : undefined
  if (!flowgladOrganizationId) {
    console.error(
      'Error: flowglad_organization_id argument is required'
    )
    process.exit(1)
  }
  if (!stripeKey) {
    console.error('Error: stripe_key value cannot be empty')
    process.exit(1)
  }
  const stripeClient = new Stripe(stripeKey)
  const products: Stripe.Product[] = await getAllStripeRecords(
    (params) => stripeClient.products.list(params)
  )
  const stripeProductsByStripeProductId = new Map<
    string,
    Stripe.Product
  >(products.map((product) => [product.id, product]))
  const defaultCatalog = await db.transaction(async (transaction) => {
    return selectDefaultCatalog(
      {
        organizationId: flowgladOrganizationId,
        livemode: true,
      },
      transaction
    )
  })
  if (!defaultCatalog) {
    console.error('Error: default catalog not found')
    process.exit(1)
  }
  const productInserts = products.map((product) =>
    stripeProductToProductInsert(product, defaultCatalog, {
      livemode: true,
      organizationId: flowgladOrganizationId,
    })
  )
  const stripePrices: Stripe.Price[] = await getAllStripeRecords(
    (params) => stripeClient.prices.list(params)
  )
  const stripeCustomers: Stripe.Customer[] =
    await getAllStripeRecords((params) =>
      stripeClient.customers.list(params)
    )
  const stripeSubscriptions: Stripe.Subscription[] =
    await getAllStripeRecords((params) =>
      stripeClient.subscriptions.list(params)
    )

  await db.transaction(async (transaction) => {
    const productRecords =
      await bulkInsertOrDoNothingProductsByExternalId(
        productInserts,
        transaction
      )
    const productsByStripeProductId = new Map<string, Product.Record>(
      productRecords.map((product) => [product.externalId!, product])
    )
    const priceInserts: Price.Insert[] = stripePrices.map((price) =>
      stripePriceToPriceInsert(
        price,
        stripeProductsByStripeProductId.get(
          stripeIdFromObjectOrId(price.product)
        )!,
        productsByStripeProductId.get(
          stripeIdFromObjectOrId(price.product)
        )!,
        {
          livemode: true,
          organizationId: flowgladOrganizationId,
        }
      )
    )
    await bulkInsertOrDoNothingPricesByExternalId(
      priceInserts,
      transaction
    )
    const priceRecords = await selectPrices(
      {
        externalId: stripePrices.map((price) => price.id),
      },
      transaction
    )
    const pricesByStripePriceId = new Map<string, Price.Record>(
      priceRecords.map((price) => [price.externalId!, price])
    )
    const customerInserts: Customer.Insert[] = stripeCustomers.map(
      (customer) =>
        stripeCustomerToCustomerInsert(customer, {
          livemode: true,
          organizationId: flowgladOrganizationId,
        })
    )
    const customerRecords =
      await bulkInsertOrDoNothingCustomersByStripeCustomerId(
        customerInserts,
        transaction
      )
    const customersByStripeCustomerId = new Map<
      string,
      Customer.Record
    >(
      customerRecords.map((customer) => [
        customer.stripeCustomerId!,
        customer,
      ])
    )

    const subscriptionInserts: Subscription.Insert[] =
      stripeSubscriptions.map((subscription) =>
        stripeSubscriptionToSubscriptionInsert(
          subscription,
          customersByStripeCustomerId.get(
            stripeIdFromObjectOrId(subscription.customer)
          )!,
          {
            livemode: true,
            organizationId: flowgladOrganizationId,
          }
        )
      )
    await bulkInsertOrDoNothingSubscriptionsByExternalId(
      subscriptionInserts,
      transaction
    )
    const subscriptionRecords = await selectSubscriptions(
      {
        externalId: stripeSubscriptions.map(
          (subscription) => subscription.id
        ),
        organizationId: flowgladOrganizationId,
      },
      transaction
    )
    const subscriptionsByStripeSubscriptionId = new Map<
      string,
      Subscription.Record
    >(
      subscriptionRecords.map((subscription) => [
        subscription.externalId!,
        subscription,
      ])
    )
    const stripeSubscriptionItems: Stripe.SubscriptionItem[] =
      stripeSubscriptions.map((sub) => sub.items.data).flat()
    const subscriptionItemInserts: SubscriptionItem.Insert[] =
      stripeSubscriptionItems.map((subscriptionItem) =>
        stripeSubscriptionItemToSubscriptionItemInsert(
          subscriptionItem,
          subscriptionsByStripeSubscriptionId.get(
            stripeIdFromObjectOrId(subscriptionItem.subscription)
          )!,
          pricesByStripePriceId.get(
            stripeIdFromObjectOrId(subscriptionItem.price)
          )!,
          {
            livemode: true,
            organizationId: flowgladOrganizationId,
          }
        )
      )
    await bulkInsertOrDoNothingSubscriptionItemsByExternalId(
      subscriptionItemInserts,
      transaction
    )
  })
}

runScript(example)
