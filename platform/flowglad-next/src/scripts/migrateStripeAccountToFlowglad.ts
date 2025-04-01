/* Example script with targeted environment
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/migrateStripeAccountToFlowglad.ts connected_account_id=acct_...
*/
import * as R from 'ramda'
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
  selectProducts,
} from '@/db/tableMethods/productMethods'
import core from '@/utils/core'
import { stripe, stripeIdFromObjectOrId } from '@/utils/stripe'
import { Price } from '@/db/schema/prices'
import {
  bulkInsertOrDoNothingPricesByExternalId,
  selectPrices,
} from '@/db/tableMethods/priceMethods'
import {
  bulkInsertOrDoNothingCustomersByStripeCustomerId,
  selectCustomers,
} from '@/db/tableMethods/customerMethods'
import { Customer } from '@/db/schema/customers'
import { Product } from '@/db/schema/products'
import { Subscription } from '@/db/schema/subscriptions'
import {
  bulkInsertOrDoNothingSubscriptionsByExternalId,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { bulkInsertOrDoNothingSubscriptionItemsByExternalId } from '@/db/tableMethods/subscriptionItemMethods'
import { selectOrganizations } from '@/db/tableMethods/organizationMethods'

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
    console.log('iterator', iterator)
    startingAfter = iterator.data[iterator.data.length - 1].id
  }
  return records
}

async function migrateStripeAccountToFlowglad(
  db: PostgresJsDatabase
) {
  // Get the stripe key from command line arguments
  const args = process.argv.slice(2)
  const connectedAccountIdArg = args.find((arg) =>
    arg.startsWith('connected_account_id=')
  )
  if (!connectedAccountIdArg) {
    console.error('Error: connected_account_id argument is required')
    console.error(
      'Usage: NODE_ENV=production pnpm tsx src/scripts/migrateStripeAccountToFlowglad.ts connected_account_id=acct_...'
    )
    process.exit(1)
  }
  const stripeAccountId = connectedAccountIdArg.split('=')[1]
  const stripeClient = stripe(true)
  const stripeProducts: Stripe.Product[] = await getAllStripeRecords(
    (params) =>
      stripeClient.products.list(params, {
        stripeAccount: stripeAccountId,
      })
  )
  const stripeProductsByStripeProductId = new Map<
    string,
    Stripe.Product
  >(stripeProducts.map((product) => [product.id, product]))

  const { defaultCatalog, flowgladOrganizationId } =
    await db.transaction(async (transaction) => {
      const [organization] = await selectOrganizations(
        {
          stripeAccountId,
        },
        transaction
      )
      if (!organization) {
        console.error('Error: organization not found')
        process.exit(1)
      }
      const defaultCatalog = await selectDefaultCatalog(
        {
          organizationId: organization.id,
          livemode: true,
        },
        transaction
      )
      return {
        defaultCatalog,
        flowgladOrganizationId: organization.id,
      }
    })
  if (!defaultCatalog) {
    console.error('Error: default catalog not found')
    process.exit(1)
  }
  const productInserts = stripeProducts.map((product) =>
    stripeProductToProductInsert(product, defaultCatalog, {
      livemode: true,
      organizationId: flowgladOrganizationId,
    })
  )
  const stripePrices: Stripe.Price[] = await getAllStripeRecords(
    (params) =>
      stripeClient.prices.list(params, {
        stripeAccount: stripeAccountId,
      })
  )
  const stripeCustomers: Stripe.Customer[] =
    await getAllStripeRecords((params) =>
      stripeClient.customers.list(params, {
        stripeAccount: stripeAccountId,
      })
    )
  const stripeSubscriptions: Stripe.Subscription[] =
    await getAllStripeRecords((params) =>
      stripeClient.subscriptions.list(
        {
          ...params,
          expand: ['data.default_payment_method'], // This expands the default_payment_method field
        },
        {
          stripeAccount: stripeAccountId,
        }
      )
    )

  const stripeSubscriptionsByStripeCustomerId = new Map<
    string,
    Stripe.Subscription
  >(
    stripeSubscriptions.map((subscription) => [
      stripeIdFromObjectOrId(subscription.customer),
      subscription,
    ])
  )
  console.log('stripeSubscriptions[0]', stripeSubscriptions[0])
  throw new Error('===Made it to the finish line!!!')
  await db.transaction(async (transaction) => {
    await bulkInsertOrDoNothingProductsByExternalId(
      productInserts,
      transaction
    )
    const productRecords = await selectProducts(
      {
        externalId: stripeProducts.map((product) => product.id),
      },
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
    // const pricesByStripePriceId = new Map<string, Price.Record>(
    //   priceRecords.map((price) => [price.externalId!, price])
    // )
    // const subscriptionInserts: Subscription.Insert[] =
    //   stripeSubscriptions.map((subscription) =>
    //     stripeSubscriptionToSubscriptionInsert(
    //       subscription,
    //       customersByStripeCustomerId.get(
    //         stripeIdFromObjectOrId(subscription.customer)
    //       )!,
    //       {
    //         livemode: true,
    //         organizationId: flowgladOrganizationId,
    //       }
    //     )
    //   )
    // await bulkInsertOrDoNothingSubscriptionsByExternalId(
    //   subscriptionInserts,
    //   transaction
    // )
    // const subscriptionRecords = await selectSubscriptions(
    //   {
    //     externalId: stripeSubscriptions.map(
    //       (subscription) => subscription.id
    //     ),
    //     organizationId: flowgladOrganizationId,
    //   },
    //   transaction
    // )
    // const subscriptionsByStripeSubscriptionId = new Map<
    //   string,
    //   Subscription.Record
    // >(
    //   subscriptionRecords.map((subscription) => [
    //     subscription.externalId!,
    //     subscription,
    //   ])
    // )
    // const stripeSubscriptionItems: Stripe.SubscriptionItem[] =
    //   stripeSubscriptions.map((sub) => sub.items.data).flat()
    // const subscriptionItemInserts: SubscriptionItem.Insert[] =
    //   stripeSubscriptionItems.map((subscriptionItem) =>
    //     stripeSubscriptionItemToSubscriptionItemInsert(
    //       subscriptionItem,
    //       subscriptionsByStripeSubscriptionId.get(
    //         stripeIdFromObjectOrId(subscriptionItem.subscription)
    //       )!,
    //       pricesByStripePriceId.get(
    //         stripeIdFromObjectOrId(subscriptionItem.price)
    //       )!,
    //       {
    //         livemode: true,
    //         organizationId: flowgladOrganizationId,
    //       }
    //     )
    //   )
    // await bulkInsertOrDoNothingSubscriptionItemsByExternalId(
    //   subscriptionItemInserts,
    //   transaction
    // )
    // throw new Error('Made it to the finish line!!!')
  })
  await db.transaction(async (transaction) => {
    const customerInserts: Customer.Insert[] = stripeCustomers.map(
      (customer) =>
        stripeCustomerToCustomerInsert(customer, {
          livemode: true,
          organizationId: flowgladOrganizationId,
        })
    )

    await bulkInsertOrDoNothingCustomersByStripeCustomerId(
      customerInserts,
      transaction
    )
    const customerRecords = await selectCustomers(
      {
        stripeCustomerId: stripeCustomers.map((customer) =>
          stripeIdFromObjectOrId(customer.id)
        ),
        organizationId: flowgladOrganizationId,
        livemode: true,
      },
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

    throw new Error('Made it to the finish line!!!')
  })
}

runScript(migrateStripeAccountToFlowglad)
