import { Result } from 'better-result'
import Stripe from 'stripe'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import { Customer } from '@/db/schema/customers'
import { DiscountRedemption } from '@/db/schema/discountRedemptions'
import type { Discount } from '@/db/schema/discounts'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import { Purchase } from '@/db/schema/purchases'
import { Subscription } from '@/db/schema/subscriptions'
import {
  checkoutSessionIsInTerminalState,
  isCheckoutSessionSubscriptionCreating,
  selectCheckoutSessionById,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import {
  selectCustomerById,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { updatePurchase } from '@/db/tableMethods/purchaseMethods'
import { selectSubscriptionAndItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  safelyUpdateSubscriptionsForCustomerToNewPaymentMethod,
  selectSubscriptionById,
  selectSubscriptions,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import { NotFoundError, ValidationError } from '@/errors'
import { activateSubscription } from '@/subscriptions/createSubscription/helpers'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription/workflow'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  EventNoun,
  FlowgladEventType,
  PurchaseStatus,
  SubscriptionStatus,
} from '@/types'
import { CacheDependency } from '@/utils/cache'
import {
  IntentMetadataType,
  StripeIntentMetadata,
  stripeIdFromObjectOrId,
  stripeIntentMetadataSchema,
} from '@/utils/stripe'
import { hasCustomerUsedTrial } from '../checkoutHelpers'
import { constructPurchaseCompletedEventHash } from '../eventHelpers'
import { paymentMethodForStripePaymentMethodId } from '../paymentMethodHelpers'
import { processPurchaseBookkeepingForCheckoutSession } from './checkoutSessions'

export const setupIntentStatusToCheckoutSessionStatus = (
  status: Stripe.SetupIntent.Status
): CheckoutSessionStatus => {
  switch (status) {
    case 'succeeded':
      return CheckoutSessionStatus.Succeeded
    case 'processing':
      return CheckoutSessionStatus.Pending
    case 'canceled':
      return CheckoutSessionStatus.Failed
    case 'requires_payment_method':
      return CheckoutSessionStatus.Pending
    default:
      return CheckoutSessionStatus.Pending
  }
}

export type CoreSripeSetupIntent = Pick<
  Stripe.SetupIntent,
  'id' | 'metadata' | 'status' | 'customer' | 'payment_method'
>

interface ProcessTerminalCheckoutSessionSetupIntentResult {
  type: CheckoutSessionType
  checkoutSession: CheckoutSession.Record
  organization: Organization.Record
  customer: Customer.Record
  billingRun: null
  purchase: null
  price: null
}

export const processTerminalCheckoutSessionSetupIntent = async (
  checkoutSession: CheckoutSession.Record,
  transaction: DbTransaction
): Promise<ProcessTerminalCheckoutSessionSetupIntentResult> => {
  const organization = (
    await selectOrganizationById(
      checkoutSession.organizationId,
      transaction
    )
  ).unwrap()
  const customer = (
    await selectCustomerById(checkoutSession.customerId!, transaction)
  ).unwrap()
  return {
    type: checkoutSession.type,
    checkoutSession,
    organization,
    customer,
    billingRun: null,
    purchase: null,
    price: null,
  }
}

export const processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded =
  async (
    setupIntent: CoreSripeSetupIntent,
    ctx: TransactionEffectsContext
  ): Promise<
    Result<
      {
        purchase: Purchase.Record
        checkoutSession: CheckoutSession.Record
        price: Price.Record
        organization: Organization.Record
        product: Product.Record | null
        customer: Customer.Record
        discount: Discount.Record | null
        feeCalculation:
          | import('@/db/schema/feeCalculations').FeeCalculation.Record
          | null
        discountRedemption: DiscountRedemption.Record | null
        paymentMethod: PaymentMethod.Record
      },
      NotFoundError | ValidationError
    >
  > => {
    const { transaction } = ctx
    const checkoutSessionResult =
      await checkoutSessionFromSetupIntent(setupIntent, transaction)
    if (checkoutSessionResult.status === 'error') {
      return Result.err(checkoutSessionResult.error)
    }
    const initialCheckoutSession = checkoutSessionResult.value
    if (checkoutSessionIsInTerminalState(initialCheckoutSession)) {
      return Result.err(
        new ValidationError(
          'checkoutSession.status',
          `processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded: Checkout session is in terminal state (checkout session id: ${initialCheckoutSession.id})`
        )
      )
    }
    const checkoutSession = await updateCheckoutSession(
      {
        ...initialCheckoutSession,
        status: setupIntentStatusToCheckoutSessionStatus(
          setupIntent.status
        ),
      },
      transaction
    )

    if (
      checkoutSession.type === CheckoutSessionType.AddPaymentMethod
    ) {
      return Result.err(
        new ValidationError(
          'checkoutSession.type',
          `processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded: Add payment method checkout flow not support (checkout session id: ${checkoutSession.id})`
        )
      )
    }
    if (
      checkoutSession.type ===
      CheckoutSessionType.ActivateSubscription
    ) {
      return Result.err(
        new ValidationError(
          'checkoutSession.type',
          `processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded: Activate subscription checkout flow not supported (checkout session id: ${checkoutSession.id})`
        )
      )
    }

    const [{ price, product, organization }] =
      await selectPriceProductAndOrganizationByPriceWhere(
        { id: checkoutSession.priceId },
        transaction
      )

    const {
      purchase,
      customer,
      discount,
      feeCalculation,
      discountRedemption,
    } = await processPurchaseBookkeepingForCheckoutSession(
      {
        checkoutSession,
        stripeCustomerId: setupIntent.customer
          ? stripeIdFromObjectOrId(setupIntent.customer)
          : null,
      },
      ctx
    )
    const { paymentMethod } =
      await pullStripeSetupIntentDataToDatabase(
        setupIntent,
        customer,
        ctx
      )
    return Result.ok({
      purchase,
      checkoutSession,
      price,
      organization,
      product,
      customer,
      discount,
      feeCalculation,
      discountRedemption,
      paymentMethod,
    })
  }

export const calculateTrialEnd = (params: {
  hasHadTrial: boolean
  trialPeriodDays: number | null | undefined
}): number | undefined => {
  const { hasHadTrial, trialPeriodDays } = params
  if (
    trialPeriodDays === null ||
    trialPeriodDays === undefined ||
    trialPeriodDays === 0
  ) {
    return undefined
  }
  return hasHadTrial
    ? undefined
    : Date.now() + trialPeriodDays * 24 * 60 * 60 * 1000
}

export const pullStripeSetupIntentDataToDatabase = async (
  setupIntent: CoreSripeSetupIntent,
  customer: Pick<
    Customer.Record,
    'id' | 'stripeCustomerId' | 'livemode'
  >,
  ctx: TransactionEffectsContext
) => {
  const { transaction } = ctx
  const stripeCustomerId = setupIntent.customer
    ? stripeIdFromObjectOrId(setupIntent.customer)
    : null

  if (stripeCustomerId !== customer.stripeCustomerId) {
    customer = await updateCustomer(
      {
        id: customer.id,
        stripeCustomerId,
      },
      transaction
    )
  }

  const stripePaymentMethodId = stripeIdFromObjectOrId(
    setupIntent.payment_method!
  )
  const paymentMethod = await paymentMethodForStripePaymentMethodId(
    {
      stripePaymentMethodId,
      livemode: customer.livemode,
      customerId: customer.id,
    },
    ctx
  )
  return {
    customer,
    paymentMethod,
  }
}

export const checkoutSessionFromSetupIntent = async (
  setupIntent: Pick<
    CoreSripeSetupIntent,
    'status' | 'metadata' | 'id'
  >,
  transaction: DbTransaction
): Promise<
  Result<CheckoutSession.Record, NotFoundError | ValidationError>
> => {
  const metadata: StripeIntentMetadata =
    stripeIntentMetadataSchema.parse(setupIntent.metadata)
  if (!metadata) {
    return Result.err(
      new NotFoundError('SetupIntentMetadata', setupIntent.id)
    )
  }
  // FIXME: handle non-success cases
  if (setupIntent.status !== 'succeeded') {
    return Result.err(
      new ValidationError(
        'setupIntent.status',
        `Setup intent ${setupIntent.id} is not succeeded, but ${setupIntent.status}.`
      )
    )
  }
  if (metadata.type !== IntentMetadataType.CheckoutSession) {
    return Result.err(
      new ValidationError(
        'setupIntentMetadata.type',
        `Metadata type is not checkout_session for setup intent ${setupIntent.id}`
      )
    )
  }
  const checkoutSessionId = metadata.checkoutSessionId
  const checkoutSession = await selectCheckoutSessionById(
    checkoutSessionId,
    transaction
  )
  return Result.ok(checkoutSession)
}

interface ProcessAddPaymentMethodSetupIntentSucceededResult {
  type: CheckoutSessionType.AddPaymentMethod
  purchase: null
  price: null
  product: null
  billingRun: null
  checkoutSession: CheckoutSession.Record
  organization: Organization.Record
  customer: Pick<
    Customer.Record,
    'id' | 'stripeCustomerId' | 'livemode'
  >
}

export const processAddPaymentMethodSetupIntentSucceeded = async (
  setupIntent: CoreSripeSetupIntent,
  ctx: TransactionEffectsContext
): Promise<
  Result<
    ProcessAddPaymentMethodSetupIntentSucceededResult,
    NotFoundError | ValidationError
  >
> => {
  const { transaction, invalidateCache } = ctx
  const checkoutSessionResult = await checkoutSessionFromSetupIntent(
    setupIntent,
    transaction
  )
  if (checkoutSessionResult.status === 'error') {
    return Result.err(checkoutSessionResult.error)
  }
  const initialCheckoutSession = checkoutSessionResult.value
  const checkoutSession = await updateCheckoutSession(
    {
      ...initialCheckoutSession,
      status: setupIntentStatusToCheckoutSessionStatus(
        setupIntent.status
      ),
    },
    transaction
  )
  const initialCustomer = (
    await selectCustomerById(checkoutSession.customerId!, transaction)
  ).unwrap()
  const { customer, paymentMethod } =
    await pullStripeSetupIntentDataToDatabase(
      setupIntent,
      initialCustomer,
      ctx
    )
  if (checkoutSession.targetSubscriptionId) {
    const subscription = (
      await selectSubscriptionById(
        checkoutSession.targetSubscriptionId,
        transaction
      )
    ).unwrap()
    if (subscription.status === SubscriptionStatus.CreditTrial) {
      return Result.err(
        new ValidationError(
          'subscription.status',
          `Subscription ${subscription.id} is a credit trial subscription. To add a payment method to it, you must first upgrade to a paid plan.`
        )
      )
    }
    await updateSubscription(
      {
        id: checkoutSession.targetSubscriptionId,
        defaultPaymentMethodId: paymentMethod.id,
        renews: subscription.renews,
      },
      transaction
    )
  }

  if (checkoutSession.automaticallyUpdateSubscriptions) {
    await safelyUpdateSubscriptionsForCustomerToNewPaymentMethod(
      paymentMethod,
      transaction
    )
  }

  const organization = (
    await selectOrganizationById(
      checkoutSession.organizationId,
      transaction
    )
  ).unwrap()

  // Invalidate payment methods cache after adding a new payment method
  invalidateCache(CacheDependency.customerPaymentMethods(customer.id))

  return Result.ok({
    type: CheckoutSessionType.AddPaymentMethod,
    purchase: null,
    price: null,
    product: null,
    billingRun: null,
    checkoutSession,
    organization,
    customer,
  })
}

interface ProcessSubscriptionCreatingCheckoutSessionSetupIntentSucceededResult {
  type: CheckoutSessionType.Product | CheckoutSessionType.Purchase
  /**
   * Only provided on the first time the checkout session is created
   * and is null on subsequent calls
   */
  purchase: Purchase.Record | null
  price: Price.Record
  product: Product.Record
  billingRun: BillingRun.Record | null
  checkoutSession: CheckoutSession.Record
  organization: Organization.Record
  customer: Pick<
    Customer.Record,
    'id' | 'stripeCustomerId' | 'livemode'
  >
}

interface SetupIntentSucceededBookkeepingResult {
  checkoutSession: CheckoutSession.Record
  price: Price.Record
  /**
   * Product may be null for usage prices, but checkout sessions
   * for subscription creation always require a product.
   * The null case should be validated at runtime.
   */
  product: Product.Record | null
  purchase: Purchase.Record
  organization: Organization.Record
  customer: Customer.Record
  paymentMethod: PaymentMethod.Record
  discountRedemption?: DiscountRedemption.Record | null
}

export const createSubscriptionFromSetupIntentableCheckoutSession =
  async (
    {
      setupIntent,
      checkoutSession,
      price,
      product,
      purchase,
      organization,
      customer,
      paymentMethod,
      discountRedemption,
    }: SetupIntentSucceededBookkeepingResult & {
      setupIntent: CoreSripeSetupIntent
    },
    ctx: TransactionEffectsContext
  ): Promise<
    Result<
      ProcessSubscriptionCreatingCheckoutSessionSetupIntentSucceededResult,
      Error
    >
  > => {
    const { transaction, emitEvent } = ctx
    if (!customer) {
      return Result.err(new NotFoundError('Customer', setupIntent.id))
    }

    if (!isCheckoutSessionSubscriptionCreating(checkoutSession)) {
      return Result.err(
        new ValidationError(
          'checkoutSession.type',
          `createSubscriptionFromSetupIntentableCheckoutSession: checkout session ${checkoutSession.id} is not supported because it is of type ${checkoutSession.type}.`
        )
      )
    }
    /**
     * If the price, product, or purchase are not found,
     * we don't need to create a subscription because that means
     * the checkout session was for adding a payment method
     */
    if (!price) {
      return Result.err(
        new NotFoundError(
          'Price',
          `for setup intent ${setupIntent.id}, and checkout session ${checkoutSession.id} of type ${checkoutSession.type}. This should only happen for add payment method checkout sessions.`
        )
      )
    }

    if (!product) {
      return Result.err(
        new NotFoundError(
          'Product',
          `for setup intent ${setupIntent.id}, and checkout session ${checkoutSession.id} of type ${checkoutSession.type}. This should only happen for add payment method checkout sessions.`
        )
      )
    }

    if (!purchase) {
      return Result.err(
        new NotFoundError(
          'Purchase',
          `for setup intent ${setupIntent.id}, and checkout session ${checkoutSession.id} of type ${checkoutSession.type}. This should only happen for add payment method checkout sessions.`
        )
      )
    }

    if (!price.intervalUnit) {
      return Result.err(
        new ValidationError(
          'price.intervalUnit',
          'Price interval unit is required'
        )
      )
    }

    if (!price.intervalCount) {
      return Result.err(
        new ValidationError(
          'price.intervalCount',
          'Price interval count is required'
        )
      )
    }

    const hasHadTrial = await hasCustomerUsedTrial(
      customer.id,
      transaction
    )

    const startDate = Date.now()
    const now = Date.now()

    const workflowResult = await createSubscriptionWorkflow(
      {
        stripeSetupIntentId: setupIntent.id,
        defaultPaymentMethod: paymentMethod,
        organization,
        price,
        customer,
        interval: price.intervalUnit,
        intervalCount: price.intervalCount,
        discountRedemption,
        /**
         * If the price has a trial period, set the trial end date to the
         * end of the period
         */
        trialEnd: calculateTrialEnd({
          hasHadTrial,
          trialPeriodDays: price.trialPeriodDays,
        }),
        startDate,
        preserveBillingCycleAnchor:
          checkoutSession.preserveBillingCycleAnchor ?? false,
        autoStart: true,
        quantity: checkoutSession.quantity,
        metadata: checkoutSession.outputMetadata ?? {},
        name: checkoutSession.outputName ?? undefined,
        product,
        livemode: checkoutSession.livemode,
      },
      ctx
    )

    if (workflowResult.status === 'error') {
      return Result.err(workflowResult.error)
    }
    const output = workflowResult.value

    const updatedPurchase = await updatePurchase(
      {
        id: purchase.id,
        status: PurchaseStatus.Paid,
        priceType: price.type,
        purchaseDate: now,
      },
      transaction
    )
    // Invalidate purchase cache after updating purchase content (status)
    ctx.invalidateCache(CacheDependency.purchase(updatedPurchase.id))

    // Emit purchase completed event
    emitEvent({
      type: FlowgladEventType.PurchaseCompleted,
      occurredAt: now,
      organizationId: organization.id,
      livemode: updatedPurchase.livemode,
      metadata: {},
      submittedAt: now,
      processedAt: null,
      hash: constructPurchaseCompletedEventHash(updatedPurchase),
      payload: {
        id: updatedPurchase.id,
        object: EventNoun.Purchase,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      },
    })

    return Result.ok({
      purchase: updatedPurchase,
      checkoutSession,
      billingRun: output.billingRun,
      price,
      product,
      organization,
      customer,
      type: checkoutSession.type,
    })
  }

export interface ProcessActivateSubscriptionCheckoutSessionSetupIntentSucceededResult {
  type: CheckoutSessionType.ActivateSubscription
  checkoutSession: CheckoutSession.Record
  organization: Organization.Record
  customer: Customer.Record
  paymentMethod: PaymentMethod.Record
  billingRun: BillingRun.Record | null
  subscription: Subscription.Record
  purchase: null
}

const processActivateSubscriptionCheckoutSessionSetupIntentSucceeded =
  async (
    setupIntent: CoreSripeSetupIntent,
    ctx: TransactionEffectsContext
  ): Promise<
    Result<
      ProcessActivateSubscriptionCheckoutSessionSetupIntentSucceededResult,
      NotFoundError | ValidationError
    >
  > => {
    const { transaction } = ctx
    const checkoutSessionResult =
      await checkoutSessionFromSetupIntent(setupIntent, transaction)
    if (checkoutSessionResult.status === 'error') {
      return Result.err(checkoutSessionResult.error)
    }
    const initialCheckoutSession = checkoutSessionResult.value
    const checkoutSession = await updateCheckoutSession(
      {
        ...initialCheckoutSession,
        status: setupIntentStatusToCheckoutSessionStatus(
          setupIntent.status
        ),
      },
      transaction
    )
    const result = await selectSubscriptionAndItems(
      {
        id: checkoutSession.targetSubscriptionId!,
      },
      transaction
    )
    if (!result) {
      return Result.err(
        new NotFoundError(
          'Subscription',
          checkoutSession.targetSubscriptionId!
        )
      )
    }

    // Fetch customer and payment method (needed in all paths)
    const customer = (
      await selectCustomerById(
        result.subscription.customerId,
        transaction
      )
    ).unwrap()
    const { paymentMethod } =
      await pullStripeSetupIntentDataToDatabase(
        setupIntent,
        customer,
        ctx
      )

    // Defense-in-depth: Check if this exact setup intent was already processed
    // (outer idempotency check should catch this, but this provides additional safety)
    if (result.subscription.stripeSetupIntentId === setupIntent.id) {
      return Result.ok({
        type: CheckoutSessionType.ActivateSubscription as const,
        checkoutSession,
        organization: (
          await selectOrganizationById(
            checkoutSession.organizationId,
            transaction
          )
        ).unwrap(),
        customer,
        paymentMethod,
        billingRun: null,
        subscription: result.subscription,
        purchase: null,
      })
    }

    // Set stripeSetupIntentId BEFORE activateSubscription to prevent race conditions
    // This ensures concurrent webhook deliveries will fail the idempotency check
    const updatedSubscription = await updateSubscription(
      {
        id: result.subscription.id,
        stripeSetupIntentId: setupIntent.id,
        renews: result.subscription.renews,
      },
      transaction
    )

    const activationResult = await activateSubscription(
      {
        subscription: updatedSubscription,
        subscriptionItems: result.subscriptionItems,
        defaultPaymentMethod: paymentMethod,
        autoStart: true,
      },
      ctx
    )
    if (activationResult.status === 'error') {
      throw activationResult.error
    }
    const { billingRun } = activationResult.value

    // Fetch the subscription again to get the updated status after activation
    const activatedSubscription = (
      await selectSubscriptionById(
        updatedSubscription.id,
        transaction
      )
    ).unwrap()

    return Result.ok({
      type: CheckoutSessionType.ActivateSubscription as const,
      checkoutSession,
      organization: (
        await selectOrganizationById(
          checkoutSession.organizationId,
          transaction
        )
      ).unwrap(),
      customer: (
        await selectCustomerById(
          checkoutSession.customerId!,
          transaction
        )
      ).unwrap(),
      paymentMethod: await paymentMethodForStripePaymentMethodId(
        {
          stripePaymentMethodId: stripeIdFromObjectOrId(
            setupIntent.payment_method!
          ),
          livemode: checkoutSession.livemode,
          customerId: checkoutSession.customerId!,
        },
        ctx
      ),
      billingRun,
      subscription: activatedSubscription,
      purchase: null,
    })
  }

export const processSetupIntentSucceeded = async (
  setupIntent: CoreSripeSetupIntent,
  ctx: TransactionEffectsContext
): Promise<
  Result<
    | ProcessSubscriptionCreatingCheckoutSessionSetupIntentSucceededResult
    | ProcessAddPaymentMethodSetupIntentSucceededResult
    | ProcessTerminalCheckoutSessionSetupIntentResult
    | ProcessActivateSubscriptionCheckoutSessionSetupIntentSucceededResult,
    Error
  >
> => {
  const { transaction, invalidateCache } = ctx
  // Check if this setup intent was already processed (idempotency check)
  const existingSubscription = await selectSubscriptions(
    {
      stripeSetupIntentId: setupIntent.id,
    },
    transaction
  )

  if (existingSubscription.length > 0) {
    // This setup intent was already processed, return the existing subscription
    // This prevents duplicate subscription creation in case of webhook replay
    const subscription = existingSubscription[0]
    const checkoutSessionResult =
      await checkoutSessionFromSetupIntent(setupIntent, transaction)
    if (checkoutSessionResult.status === 'error') {
      return Result.err(checkoutSessionResult.error)
    }
    const checkoutSession = checkoutSessionResult.value
    const customer = (
      await selectCustomerById(subscription.customerId!, transaction)
    ).unwrap()
    const paymentMethod = subscription.defaultPaymentMethodId
      ? await selectPaymentMethodById(
          subscription.defaultPaymentMethodId,
          transaction
        )
      : undefined

    // Determine result type based on checkout session type
    if (
      checkoutSession.type ===
      CheckoutSessionType.ActivateSubscription
    ) {
      const organization = (
        await selectOrganizationById(
          checkoutSession.organizationId,
          transaction
        )
      ).unwrap()

      // Ensure payment method exists for activation
      if (!paymentMethod) {
        return Result.err(
          new NotFoundError(
            'PaymentMethod',
            `processSetupIntentSucceeded: Payment method required for subscription activation (checkout session id: ${checkoutSession.id})`
          )
        )
      }

      return Result.ok({
        type: CheckoutSessionType.ActivateSubscription,
        checkoutSession,
        organization,
        customer,
        paymentMethod,
        billingRun: null,
        subscription,
        purchase: null,
      })
    }
    if (checkoutSession.type === CheckoutSessionType.Purchase) {
      return Result.err(
        new ValidationError(
          'checkoutSession.type',
          `processSetupIntentSucceeded: Purchase checkout flow not supported (checkout session id: ${checkoutSession.id})`
        )
      )
    }
    if (
      checkoutSession.type === CheckoutSessionType.AddPaymentMethod
    ) {
      return Result.err(
        new ValidationError(
          'checkoutSession.type',
          `processSetupIntentSucceeded: Add payment method checkout flow not supported (checkout session id: ${checkoutSession.id})`
        )
      )
    }
    // Default to subscription creating result type
    const priceResult =
      await selectPriceProductAndOrganizationByPriceWhere(
        { id: subscription.priceId! },
        transaction
      )

    // Validate that price result exists
    if (!priceResult[0]) {
      return Result.err(
        new NotFoundError(
          'Price',
          `processSetupIntentSucceeded: Price not found for subscription (price id: ${subscription.priceId}, checkout session id: ${checkoutSession.id})`
        )
      )
    }

    // Validate that product exists - subscription creation requires a product
    if (!priceResult[0].product) {
      return Result.err(
        new NotFoundError(
          'Product',
          `processSetupIntentSucceeded: Product not found for subscription (price id: ${subscription.priceId}, checkout session id: ${checkoutSession.id}). Usage prices are not supported for subscription checkout sessions.`
        )
      )
    }

    return Result.ok({
      type: checkoutSession.type,
      checkoutSession,
      price: priceResult[0].price,
      product: priceResult[0].product,
      organization: priceResult[0].organization,
      customer,
      billingRun: null,
      purchase: null,
    })
  }

  const initialCheckoutSessionResult =
    await checkoutSessionFromSetupIntent(setupIntent, transaction)
  if (initialCheckoutSessionResult.status === 'error') {
    return Result.err(initialCheckoutSessionResult.error)
  }
  const initialCheckoutSession = initialCheckoutSessionResult.value

  if (checkoutSessionIsInTerminalState(initialCheckoutSession)) {
    const result = await processTerminalCheckoutSessionSetupIntent(
      initialCheckoutSession,
      transaction
    )
    return Result.ok(result)
  }

  if (
    initialCheckoutSession.type ===
    CheckoutSessionType.AddPaymentMethod
  ) {
    const resultResult =
      await processAddPaymentMethodSetupIntentSucceeded(
        setupIntent,
        ctx
      )
    if (resultResult.status === 'error') {
      return Result.err(resultResult.error)
    }
    return Result.ok(resultResult.value)
  }

  if (
    initialCheckoutSession.type ===
    CheckoutSessionType.ActivateSubscription
  ) {
    const activateResult =
      await processActivateSubscriptionCheckoutSessionSetupIntentSucceeded(
        setupIntent,
        ctx
      )
    if (Result.isError(activateResult)) {
      return Result.err(activateResult.error)
    }
    invalidateCache(
      CacheDependency.customerSubscriptions(
        activateResult.value.customer.id
      )
    )
    return Result.ok(activateResult.value)
  }

  const successProcessedResultResult =
    await processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded(
      setupIntent,
      ctx
    )

  if (successProcessedResultResult.status === 'error') {
    return Result.err(successProcessedResultResult.error)
  }
  const successProcessedResult = successProcessedResultResult.value

  const withSetupIntent = Object.assign(successProcessedResult, {
    setupIntent,
  })

  return await createSubscriptionFromSetupIntentableCheckoutSession(
    withSetupIntent,
    ctx
  )
}
