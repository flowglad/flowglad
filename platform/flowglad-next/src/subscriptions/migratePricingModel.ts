import type { Customer } from '@db-core/schema/customers'
import type { Subscription } from '@db-core/schema/subscriptions'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import type { AuthenticatedProcedureTransactionParams } from '@/db/authenticatedTransaction'
import {
  selectCustomerByExternalIdAndOrganizationId,
  updateCustomer as updateCustomerDb,
} from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  selectPriceById,
  selectPricesAndProductsByProductWhere,
} from '@/db/tableMethods/priceMethods'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import {
  currentSubscriptionStatuses,
  selectSubscriptions,
  subscriptionWithCurrent,
} from '@/db/tableMethods/subscriptionMethods'
import type { TransactionEffectsContext } from '@/db/types'
import { cancelSubscriptionImmediately } from '@/subscriptions/cancelSubscription'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription'
import { CancellationReason } from '@/types'

/**
 * Cancels a subscription immediately for pricing model migration.
 * Uses cancelSubscriptionImmediately with options to skip reassignment and notifications.
 */
const cancelSubscriptionForMigration = async (
  subscription: Subscription.Record,
  customer: Customer.Record,
  ctx: TransactionEffectsContext
): Promise<Result<Subscription.Record, Error>> => {
  return cancelSubscriptionImmediately(
    {
      subscription,
      customer,
      skipNotifications: true,
      skipReassignDefaultSubscription: true,
      cancellationReason: CancellationReason.PricingModelMigration,
    },
    ctx
  )
}

export interface MigratePricingModelForCustomerParams {
  customer: Customer.Record
  oldPricingModelId: string | null
  newPricingModelId: string
}

export interface MigratePricingModelForCustomerResult {
  customer: Customer.Record
  canceledSubscriptions: Subscription.Record[]
  newSubscription: Subscription.Record
}

/**
 * Migrates a customer from one pricing model to another by:
 * 1. Canceling all existing subscriptions immediately
 * 2. Creating a new default free plan subscription on the new pricing model
 *
 * @param params - Migration parameters including customer and pricing model IDs
 * @param ctx - Transaction context with database transaction and effect callbacks.
 * @returns Transaction output with migration result
 */
export const migratePricingModelForCustomer = async (
  params: MigratePricingModelForCustomerParams,
  ctx: TransactionEffectsContext
): Promise<Result<MigratePricingModelForCustomerResult, Error>> => {
  const { transaction } = ctx
  const { customer, oldPricingModelId, newPricingModelId } = params

  // If customer is already on the target pricing model, it's a no-op
  if (oldPricingModelId === newPricingModelId) {
    // Fetch subscriptions associated with the new pricing model
    const currentSubscriptions = await selectSubscriptions(
      {
        customerId: customer.id,
        status: currentSubscriptionStatuses,
      },
      transaction
    )

    // Filter to only subscriptions on the new pricing model
    // Follow the chain: subscription → price → product → pricingModelId
    const subscriptionsOnNewPricingModel: Subscription.Record[] = []
    for (const subscription of currentSubscriptions) {
      if (subscription.priceId) {
        const priceResult = await selectPriceById(
          subscription.priceId,
          transaction
        )
        if (Result.isOk(priceResult) && priceResult.value.productId) {
          const price = priceResult.value
          const productResult = await selectProductById(
            price.productId,
            transaction
          )
          if (
            Result.isOk(productResult) &&
            productResult.value.pricingModelId === newPricingModelId
          ) {
            subscriptionsOnNewPricingModel.push(subscription)
          }
        }
      }
    }

    if (subscriptionsOnNewPricingModel.length === 0) {
      // Create default subscription
      const newSubscriptionResult =
        await createDefaultSubscriptionOnPricingModel(
          customer,
          newPricingModelId,
          ctx
        )

      if (newSubscriptionResult.status === 'error') {
        return Result.err(newSubscriptionResult.error)
      }

      // Update customer with new pricing model ID
      const updatedCustomer = await updateCustomerDb(
        {
          id: customer.id,
          pricingModelId: newPricingModelId,
        },
        transaction
      )

      return Result.ok({
        customer: updatedCustomer,
        canceledSubscriptions: [],
        newSubscription: newSubscriptionResult.value,
      })
    }

    // Find the subscription with default free price associated with a default product
    // Follow the chain: subscription → price → product
    let defaultFreeSubscription: Subscription.Record | undefined
    for (const subscription of subscriptionsOnNewPricingModel) {
      if (subscription.priceId) {
        const priceResult = await selectPriceById(
          subscription.priceId,
          transaction
        )
        if (Result.isOk(priceResult)) {
          const price = priceResult.value
          if (
            price.unitPrice === 0 &&
            price.isDefault &&
            price.productId
          ) {
            const productResult = await selectProductById(
              price.productId,
              transaction
            )
            if (
              Result.isOk(productResult) &&
              productResult.value.default
            ) {
              defaultFreeSubscription = subscription
              break
            }
          }
        }
      }
    }

    if (!defaultFreeSubscription) {
      const defaultFreeSubscriptionResult =
        await createDefaultSubscriptionOnPricingModel(
          customer,
          newPricingModelId,
          ctx
        )

      if (defaultFreeSubscriptionResult.status === 'error') {
        return Result.err(defaultFreeSubscriptionResult.error)
      }

      defaultFreeSubscription = defaultFreeSubscriptionResult.value
    }

    // Update customer with new pricing model ID (ensures it's set even in no-op case)
    const updatedCustomer = await updateCustomerDb(
      {
        id: customer.id,
        pricingModelId: newPricingModelId,
      },
      transaction
    )

    // Already on target model with subscriptions, nothing to do
    return Result.ok({
      customer: updatedCustomer,
      canceledSubscriptions: [],
      newSubscription: defaultFreeSubscription,
    })
  }

  // Validate that the new pricing model exists
  const newPricingModelResult = await selectPricingModelById(
    newPricingModelId,
    transaction
  )

  if (Result.isError(newPricingModelResult)) {
    return Result.err(
      new Error(`Pricing model ${newPricingModelId} not found`)
    )
  }
  const newPricingModel = newPricingModelResult.unwrap()

  // Validate that the new pricing model belongs to the same organization
  if (newPricingModel.organizationId !== customer.organizationId) {
    return Result.err(
      new Error(
        `Pricing model ${newPricingModelId} does not belong to organization ${customer.organizationId}`
      )
    )
  }

  if (newPricingModel.livemode !== customer.livemode) {
    return Result.err(
      new Error(`Pricing model livemode must match customer livemode`)
    )
  }

  // Fetch all current subscriptions
  const currentSubscriptions = await selectSubscriptions(
    {
      customerId: customer.id,
      status: currentSubscriptionStatuses,
    },
    transaction
  )

  // Cancel all current subscriptions
  const canceledSubscriptions: Subscription.Record[] = []

  for (const subscription of currentSubscriptions) {
    const cancelResult = await cancelSubscriptionForMigration(
      subscription,
      customer,
      ctx
    )
    if (cancelResult.status === 'error') {
      return Result.err(cancelResult.error)
    }
    canceledSubscriptions.push(cancelResult.value)
  }

  // Create default subscription on new pricing model
  const newSubscriptionResult =
    await createDefaultSubscriptionOnPricingModel(
      customer,
      newPricingModelId,
      ctx
    )

  if (newSubscriptionResult.status === 'error') {
    return Result.err(newSubscriptionResult.error)
  }

  const newSubscription = newSubscriptionResult.value

  // Update customer with new pricing model ID
  const updatedCustomer = await updateCustomerDb(
    {
      id: customer.id,
      pricingModelId: newPricingModelId,
    },
    transaction
  )

  return Result.ok({
    customer: updatedCustomer,
    canceledSubscriptions,
    newSubscription,
  })
}

/**
 * Creates a default free plan subscription on the specified pricing model.
 * If no default product exists, returns an error.
 */
async function createDefaultSubscriptionOnPricingModel(
  customer: Customer.Record,
  pricingModelId: string,
  ctx: TransactionEffectsContext
): Promise<Result<Subscription.Record, Error>> {
  const { transaction } = ctx
  const organization = (
    await selectOrganizationById(customer.organizationId, transaction)
  ).unwrap()

  // Try to find default product on the new pricing model
  let [defaultProduct] = await selectPricesAndProductsByProductWhere(
    {
      pricingModelId,
      default: true,
      active: true,
    },
    transaction
  )

  // If no default product exists, return an error
  // We return an error rather than auto-creating because it's unclear what price type
  // the default price should be (Subscription vs SinglePayment, and if Subscription,
  // what interval unit). The user should create the default product themselves and
  // set the appropriate price type.
  if (!defaultProduct) {
    return Result.err(
      new Error(
        `No default product found for pricing model ${pricingModelId}. Please create a default product with a default price before migrating customers to this pricing model.`
      )
    )
  }

  const defaultPrice = defaultProduct.defaultPrice

  if (!defaultPrice) {
    return Result.err(
      new Error(
        `Default product ${defaultProduct.id} is missing a default price`
      )
    )
  }

  const trialEnd = defaultPrice.trialPeriodDays
    ? new Date(
        Date.now() +
          defaultPrice.trialPeriodDays * 24 * 60 * 60 * 1000
      )
    : undefined

  // Create the subscription
  const subscriptionResult = await createSubscriptionWorkflow(
    {
      organization,
      customer: {
        id: customer.id,
        stripeCustomerId: customer.stripeCustomerId,
        livemode: customer.livemode,
        organizationId: customer.organizationId,
      },
      product: defaultProduct,
      price: defaultPrice,
      quantity: 1,
      livemode: customer.livemode,
      startDate: new Date(),
      interval: defaultPrice.intervalUnit,
      intervalCount: defaultPrice.intervalCount,
      trialEnd,
      autoStart: true,
      name: `${defaultProduct.name} Subscription`,
    },
    ctx
  )

  if (subscriptionResult.status === 'error') {
    return Result.err(subscriptionResult.error)
  }

  return Result.ok(subscriptionResult.value.subscription)
}

/**
 * Transaction function for the migrateCustomerPricingModel TRPC procedure.
 * Validates inputs, performs the migration, and updates the customer's pricing model ID.
 */
type MigrateCustomerPricingModelProcedureParams =
  AuthenticatedProcedureTransactionParams<
    { externalId: string; newPricingModelId: string },
    { apiKey?: string; organizationId?: string }
  >

export const migrateCustomerPricingModelProcedureTransaction =
  async ({
    input,
    ctx,
    transactionCtx,
  }: MigrateCustomerPricingModelProcedureParams): Promise<
    Result<
      {
        customer: Customer.ClientRecord
        canceledSubscriptions: Subscription.ClientRecord[]
        newSubscription: Subscription.ClientRecord
      },
      Error
    >
  > => {
    const {
      transaction,
      cacheRecomputationContext,
      invalidateCache,
      emitEvent,
      enqueueLedgerCommand,
      enqueueTriggerTask,
    } = transactionCtx
    const { organizationId } = ctx
    const { externalId, newPricingModelId } = input
    const effectsCtx: TransactionEffectsContext = {
      transaction,
      cacheRecomputationContext,
      invalidateCache,
      emitEvent,
      enqueueLedgerCommand,
      enqueueTriggerTask,
    }

    if (!organizationId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Organization ID is required',
      })
    }

    // Fetch customer by external ID
    const customer =
      await selectCustomerByExternalIdAndOrganizationId(
        { externalId, organizationId },
        transaction
      )

    if (!customer) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Customer with external ID ${externalId} not found`,
      })
    }

    // Validate that new pricing model exists and belongs to organization
    const newPricingModelResult = await selectPricingModelById(
      newPricingModelId,
      transaction
    )

    if (Result.isError(newPricingModelResult)) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Pricing model ${newPricingModelId} not found`,
      })
    }
    const newPricingModel = newPricingModelResult.unwrap()

    if (newPricingModel.organizationId !== organizationId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Pricing model does not belong to your organization',
      })
    }

    // Validate livemode matches
    if (newPricingModel.livemode !== customer.livemode) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Pricing model livemode must match customer livemode',
      })
    }

    // Perform the migration
    const migrationResult = await migratePricingModelForCustomer(
      {
        customer,
        oldPricingModelId: customer.pricingModelId,
        newPricingModelId,
      },
      effectsCtx
    )

    if (migrationResult.status === 'error') {
      return Result.err(migrationResult.error)
    }

    const result = migrationResult.value

    return Result.ok({
      customer: result.customer,
      canceledSubscriptions: result.canceledSubscriptions.map((s) =>
        subscriptionWithCurrent(s)
      ),
      newSubscription: subscriptionWithCurrent(
        result.newSubscription
      ),
    })
  }
