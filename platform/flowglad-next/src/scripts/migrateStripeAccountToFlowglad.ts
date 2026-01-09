/* 
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/migrateStripeAccountToFlowglad.ts connected_account_id=acct_...
*/
/* eslint-disable no-console */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as R from 'ramda'
import type Stripe from 'stripe'
import type { Customer } from '@/db/schema/customers'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  bulkInsertOrDoNothingCustomersByStripeCustomerId,
  selectCustomers,
} from '@/db/tableMethods/customerMethods'
import { selectOrganizations } from '@/db/tableMethods/organizationMethods'
import {
  bulkUpsertPaymentMethodsByExternalId,
  selectPaymentMethods,
} from '@/db/tableMethods/paymentMethodMethods'
import {
  bulkInsertOrDoNothingPricesByExternalId,
  selectPrices,
} from '@/db/tableMethods/priceMethods'
import { selectDefaultPricingModel } from '@/db/tableMethods/pricingModelMethods'
import {
  bulkInsertOrDoNothingProductsByExternalId,
  selectProducts,
} from '@/db/tableMethods/productMethods'
import { bulkInsertOrDoNothingSubscriptionItemsByExternalId } from '@/db/tableMethods/subscriptionItemMethods'
import {
  bulkInsertOrDoNothingSubscriptionsByExternalId,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import {
  stripeCustomerToCustomerInsert,
  stripePaymentMethodToPaymentMethodInsert,
  stripePriceToPriceInsert,
  stripeProductToProductInsert,
  stripeSubscriptionItemToSubscriptionItemInsert,
  stripeSubscriptionToSubscriptionInsert,
} from '@/migration-helpers/stripeMigrations'
import core from '@/utils/core'
import { stripe, stripeIdFromObjectOrId } from '@/utils/stripe'
import runScript from './scriptRunner'

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
    if (iterator.data.length > 0) {
      startingAfter = iterator.data[iterator.data.length - 1].id
    }
  }
  return records
}

interface CoreStripeMigrationParams {
  flowgladOrganizationId: string
  stripeAccountId: string
  stripeClient: Stripe
  db: PostgresJsDatabase
  pricingModelId: string
}

/**
 * 1. insert or do nothing customers
 * 2. for each customer, insert or do nothing platform payment methods with external id = payment method . fingerprint
 *
 */

const migrateStripeCustomerDataToFlowglad = async (
  migrationParams: CoreStripeMigrationParams
) => {
  const {
    flowgladOrganizationId,
    stripeAccountId,
    stripeClient,
    db,
    pricingModelId,
  } = migrationParams
  const stripeCustomers: Stripe.Customer[] =
    await getAllStripeRecords((params) =>
      stripeClient.customers.list(params, {
        stripeAccount: stripeAccountId,
      })
    )

  const customerRecords = await db.transaction(
    async (transaction) => {
      const customerInserts: Customer.Insert[] = stripeCustomers.map(
        (customer) =>
          stripeCustomerToCustomerInsert(customer, {
            livemode: true,
            organizationId: flowgladOrganizationId,
            pricingModelId,
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
      return customerRecords
    }
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
  const platformStripePaymentMethods: Stripe.PaymentMethod[] = []
  for (const customer of stripeCustomers) {
    const customerStripePaymentMethods = await getAllStripeRecords(
      (params) =>
        stripeClient.paymentMethods.list({
          ...params,
          customer: customer.id,
        })
    )
    platformStripePaymentMethods.push(
      ...customerStripePaymentMethods.map((item) => {
        return {
          ...item,
          // defensive, to ensure customer is always set and always the string id
          customer: customer.id,
        }
      })
    )
  }
  const paymentMethodRecords = await db.transaction(
    async (transaction) => {
      const paymentMethodInserts: PaymentMethod.Insert[] =
        platformStripePaymentMethods.map((paymentMethod) =>
          stripePaymentMethodToPaymentMethodInsert(
            paymentMethod,
            customersByStripeCustomerId.get(
              stripeIdFromObjectOrId(paymentMethod.customer!)
            )!,
            {
              livemode: true,
              organizationId: flowgladOrganizationId,
              pricingModelId,
            }
          )
        )
      const groupedByExternalId = R.groupBy(
        (paymentMethod) => paymentMethod.externalId!,
        paymentMethodInserts
      )
      // Log payment methods with duplicate externalIds
      Object.entries(groupedByExternalId)
        .filter(
          ([_, paymentMethods]) =>
            paymentMethods && paymentMethods.length > 1
        )
        .forEach(([externalId, paymentMethods]) => {
          console.log(
            `Duplicate payment methods found for externalId: ${externalId}`,
            paymentMethods
          )
        })
      await bulkUpsertPaymentMethodsByExternalId(
        paymentMethodInserts,
        transaction
      )
      const paymentMethodRecords = await selectPaymentMethods(
        {
          externalId: platformStripePaymentMethods.map(
            (paymentMethod) => paymentMethod.id
          ),
        },
        transaction
      )
      return paymentMethodRecords
    }
  )
}

const migrateStripeSubscriptionDataToFlowglad = async (
  migrationParams: CoreStripeMigrationParams
) => {
  const {
    flowgladOrganizationId,
    stripeAccountId,
    stripeClient,
    db,
    pricingModelId,
  } = migrationParams
  const stripeSubscriptions: Stripe.Subscription[] =
    await getAllStripeRecords((params) =>
      stripeClient.subscriptions.list(
        {
          ...params,
          expand: ['data.default_payment_method', 'data.items'], // This expands the default_payment_method field
        },
        {
          stripeAccount: stripeAccountId,
        }
      )
    )
  await db.transaction(async (transaction) => {
    const customerRecords = await selectCustomers(
      {
        stripeCustomerId: stripeSubscriptions.map((subscription) =>
          stripeIdFromObjectOrId(subscription.customer)
        ),
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
    const paymentMethodRecords = await selectPaymentMethods(
      {
        customerId: customerRecords.map((customer) => customer.id),
      },
      transaction
    )
    const paymentMethodRecordsByCustomerId: Record<
      string,
      PaymentMethod.Record[] | undefined
    > = R.groupBy(
      (paymentMethod) => paymentMethod.customerId!,
      paymentMethodRecords
    )
    const productsForOrganization = await selectProducts(
      {
        organizationId: flowgladOrganizationId,
      },
      transaction
    )
    const pricesForOrganization = await selectPrices(
      {
        productId: productsForOrganization.map(
          (product) => product.id
        ),
      },
      transaction
    )
    const pricesByOldStripePriceId = new Map<string, Price.Record>(
      pricesForOrganization.map((price) => [price.externalId!, price])
    )

    const subscriptionInserts: Subscription.Insert[] =
      await Promise.all(
        stripeSubscriptions.map(async (subscription) => {
          const customerRecord = customersByStripeCustomerId.get(
            stripeIdFromObjectOrId(subscription.customer)
          )!
          return stripeSubscriptionToSubscriptionInsert(
            subscription,
            customerRecord,
            paymentMethodRecordsByCustomerId[customerRecord.id] ?? [],
            pricesByOldStripePriceId.get(
              stripeIdFromObjectOrId(subscription.items.data[0].price)
            )!,
            {
              livemode: true,
              organizationId: flowgladOrganizationId,
              pricingModelId,
            },
            stripeClient
          )
        })
      )
    await bulkInsertOrDoNothingSubscriptionsByExternalId(
      subscriptionInserts,
      transaction
    )
    const subscriptionRecords = await selectSubscriptions(
      {
        externalId: subscriptionInserts.map(
          (subscription) => subscription.externalId!
        ),
      },
      transaction
    )
    const subcriptionRecordsByStripeSubscriptionId = new Map<
      string,
      Subscription.Record
    >(
      subscriptionRecords.map((subscription) => [
        subscription.externalId!,
        subscription,
      ])
    )
    const priceRecords = await selectPrices(
      {
        externalId: stripeSubscriptions.flatMap((subscription) =>
          subscription.items.data.map((item) =>
            stripeIdFromObjectOrId(item.price)
          )
        ),
      },
      transaction
    )
    const priceRecordsByExternalId = new Map<string, Price.Record>(
      priceRecords.map((price) => [price.externalId!, price])
    )
    const subscriptionItemInserts: SubscriptionItem.Insert[] =
      stripeSubscriptions.flatMap((subscription) => {
        return subscription.items.data.map((item) => {
          const priceRecord = priceRecordsByExternalId.get(
            stripeIdFromObjectOrId(item.price)
          )
          if (!priceRecord) {
            console.error(
              'Error: price record not found for subscription item',
              item
            )
            process.exit(1)
          }
          const subscriptionRecord =
            subcriptionRecordsByStripeSubscriptionId.get(
              stripeIdFromObjectOrId(subscription.id)
            )!
          if (!subscriptionRecord) {
            console.error(
              'Error: subscription record not found for subscription item',
              item
            )
            process.exit(1)
          }
          return stripeSubscriptionItemToSubscriptionItemInsert(
            item,
            subscriptionRecord,
            priceRecord,
            {
              livemode: true,
              organizationId: flowgladOrganizationId,
              pricingModelId,
            }
          )
        })
      })

    await bulkInsertOrDoNothingSubscriptionItemsByExternalId(
      subscriptionItemInserts,
      transaction
    )
  })
}

const migrateStripeCatalogDataToFlowglad = async (
  migrationParams: CoreStripeMigrationParams
) => {
  const { stripeAccountId, stripeClient, db } = migrationParams
  const activeStripeProducts: Stripe.Product[] =
    await getAllStripeRecords((params) =>
      stripeClient.products.list(params, {
        stripeAccount: stripeAccountId,
      })
    )

  const inactiveStripeProducts: Stripe.Product[] =
    await getAllStripeRecords((params) =>
      stripeClient.products.list(
        {
          ...params,
          active: false,
        },
        {
          stripeAccount: stripeAccountId,
        }
      )
    )
  const stripeProducts = [
    ...activeStripeProducts,
    ...inactiveStripeProducts,
  ]
  const stripeProductsByStripeProductId = new Map<
    string,
    Stripe.Product
  >(stripeProducts.map((product) => [product.id, product]))

  const activeStripePrices: Stripe.Price[] =
    await getAllStripeRecords((params) =>
      stripeClient.prices.list(params, {
        stripeAccount: stripeAccountId,
      })
    )
  const inactiveStripePrices: Stripe.Price[] =
    await getAllStripeRecords((params) =>
      stripeClient.prices.list(
        {
          ...params,
          active: false,
        },
        {
          stripeAccount: stripeAccountId,
        }
      )
    )

  const stripeSubscriptionsWithItems: Stripe.Subscription[] =
    await getAllStripeRecords((params) =>
      stripeClient.subscriptions.list(
        {
          ...params,
          expand: ['data.items'],
        },
        {
          stripeAccount: stripeAccountId,
        }
      )
    )
  const stripeSubscriptionItemPrices: Stripe.Price[] =
    stripeSubscriptionsWithItems.flatMap((subscription) =>
      subscription.items.data.map((item) => item.price)
    )

  const stripePrices = R.uniqBy(
    (price) => price.id,
    [
      ...activeStripePrices,
      ...inactiveStripePrices,
      ...stripeSubscriptionItemPrices,
    ]
  )

  await db.transaction(async (transaction) => {
    const defaultCatalog = await selectDefaultPricingModel(
      {
        organizationId: migrationParams.flowgladOrganizationId,
        livemode: true,
      },
      transaction
    )
    if (!defaultCatalog) {
      console.error('Error: default pricingModel not found')
      process.exit(1)
    }
    const productInserts = stripeProducts.map((product) =>
      stripeProductToProductInsert(product, defaultCatalog, {
        livemode: true,
        organizationId: migrationParams.flowgladOrganizationId,
        pricingModelId: defaultCatalog.id,
      })
    )
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
          organizationId: migrationParams.flowgladOrganizationId,
          pricingModelId: defaultCatalog.id,
        }
      )
    )
    await bulkInsertOrDoNothingPricesByExternalId(
      priceInserts,
      transaction
    )
  })
}

/**
 * In 3 steps this should:
 * 1. Migrate pricingModel: prices, products, (eventually discounts) [x]
 * 2. Migrate customers: customers [x], payment methods [x]
 * 3. Migrate subscriptions:
 *    - Subscriptions [ ]
 *    - Subscription items (eventually with discount redemptions) [ ]
 *    - Subscription default payment method [ ]
 * @param db
 */
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
      'Usage: NODE_ENV=production bunx tsx src/scripts/migrateStripeAccountToFlowglad.ts connected_account_id=acct_...'
    )
    process.exit(1)
  }
  const stripeAccountId = connectedAccountIdArg.split('=')[1]
  const stripeClient = stripe(true)

  const { flowgladOrganizationId, pricingModelId } =
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
      const defaultPricingModel = await selectDefaultPricingModel(
        {
          organizationId: organization.id,
          livemode: true,
        },
        transaction
      )
      if (!defaultPricingModel) {
        console.error('Error: default pricingModel not found')
        process.exit(1)
      }
      return {
        flowgladOrganizationId: organization.id,
        pricingModelId: defaultPricingModel.id,
      }
    })
  const migrationParams = {
    db,
    stripeClient,
    flowgladOrganizationId,
    stripeAccountId,
    pricingModelId,
  }
  // await migrateStripeCatalogDataToFlowglad(migrationParams)
  // await migrateStripeCustomerDataToFlowglad(migrationParams)
  await migrateStripeSubscriptionDataToFlowglad(migrationParams)
}

runScript(migrateStripeAccountToFlowglad)
