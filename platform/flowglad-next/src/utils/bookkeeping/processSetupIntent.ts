import {
  selectCustomerById,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PurchaseStatus,
  SubscriptionStatus,
  CancellationReason,
  FlowgladEventType,
  EventNoun,
} from '@/types'
import { DbTransaction } from '@/db/types'
import {
  StripeIntentMetadata,
  stripeIntentMetadataSchema,
  stripeIdFromObjectOrId,
  IntentMetadataType,
} from '@/utils/stripe'
import { Purchase } from '@/db/schema/purchases'
import Stripe from 'stripe'
import {
  selectPurchaseById,
  updatePurchase,
} from '@/db/tableMethods/purchaseMethods'
import { Customer } from '@/db/schema/customers'
import {
  checkoutSessionIsInTerminalState,
  isCheckoutSessionSubscriptionCreating,
  selectCheckoutSessionById,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { Price } from '@/db/schema/prices'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription/workflow'
import { processPurchaseBookkeepingForCheckoutSession } from './checkoutSessions'
import { paymentMethodForStripePaymentMethodId } from '../paymentMethodHelpers'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  safelyUpdateSubscriptionsForCustomerToNewPaymentMethod,
  selectSubscriptionById,
  selectSubscriptions,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { BillingRun } from '@/db/schema/billingRuns'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'
import { activateSubscription } from '@/subscriptions/createSubscription/helpers'
import { selectSubscriptionAndItems } from '@/db/tableMethods/subscriptionItemMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { DiscountRedemption } from '@/db/schema/discountRedemptions'
import {
  cancelFreeSubscriptionForUpgrade,
  linkUpgradedSubscriptions,
} from '@/subscriptions/cancelFreeSubscriptionForUpgrade'
import {
  constructPurchaseCompletedEventHash,
  constructSubscriptionCreatedEventHash,
} from '../eventHelpers'
import { Event } from '@/db/schema/events'

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
  const organization = await selectOrganizationById(
    checkoutSession.organizationId,
    transaction
  )
  const customer = await selectCustomerById(
    checkoutSession.customerId!,
    transaction
  )
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
    transaction: DbTransaction
  ) => {
    const initialCheckoutSession =
      await checkoutSessionFromSetupIntent(setupIntent, transaction)
    if (checkoutSessionIsInTerminalState(initialCheckoutSession)) {
      throw new Error(
        `processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded: Checkout session is in terminal state (checkout session id: ${initialCheckoutSession.id})`
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

    if (checkoutSession.type === CheckoutSessionType.Invoice) {
      throw new Error(
        `processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded: Invoice checkout flow not supported (checkout session id: ${checkoutSession.id})`
      )
    }
    if (
      checkoutSession.type === CheckoutSessionType.AddPaymentMethod
    ) {
      throw new Error(
        `processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded: Add payment method checkout flow not support (checkout session id: ${checkoutSession.id})`
      )
    }
    if (
      checkoutSession.type ===
      CheckoutSessionType.ActivateSubscription
    ) {
      throw new Error(
        `processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded: Activate subscription checkout flow not supported (checkout session id: ${checkoutSession.id})`
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
      transaction
    )
    const { paymentMethod } =
      await pullStripeSetupIntentDataToDatabase(
        setupIntent,
        customer,
        transaction
      )
    return {
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
    }
  }

export const calculateTrialEnd = (params: {
  hasHadTrial: boolean
  trialPeriodDays: number | null
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
  transaction: DbTransaction
) => {
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
    transaction
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
) => {
  const metadata: StripeIntentMetadata =
    stripeIntentMetadataSchema.parse(setupIntent.metadata)
  if (!metadata) {
    throw new Error('No metadata found')
  }
  // TODO: handle non-success cases
  if (setupIntent.status !== 'succeeded') {
    throw new Error(
      `Setup intent ${setupIntent.id} is not succeeded, but ${setupIntent.status}.`
    )
  }
  if (metadata.type !== IntentMetadataType.CheckoutSession) {
    throw new Error(
      `Metadata type is not checkout_session for setup intent ${setupIntent.id}`
    )
  }
  const checkoutSessionId = metadata.checkoutSessionId
  const checkoutSession = await selectCheckoutSessionById(
    checkoutSessionId,
    transaction
  )
  return checkoutSession
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
  transaction: DbTransaction
): Promise<ProcessAddPaymentMethodSetupIntentSucceededResult> => {
  const initialCheckoutSession = await checkoutSessionFromSetupIntent(
    setupIntent,
    transaction
  )
  const checkoutSession = await updateCheckoutSession(
    {
      ...initialCheckoutSession,
      status: setupIntentStatusToCheckoutSessionStatus(
        setupIntent.status
      ),
    },
    transaction
  )
  const initialCustomer = await selectCustomerById(
    checkoutSession.customerId!,
    transaction
  )
  const { customer, paymentMethod } =
    await pullStripeSetupIntentDataToDatabase(
      setupIntent,
      initialCustomer,
      transaction
    )
  if (checkoutSession.targetSubscriptionId) {
    const subscription = await selectSubscriptionById(
      checkoutSession.targetSubscriptionId,
      transaction
    )
    if (subscription.status === SubscriptionStatus.CreditTrial) {
      throw new Error(
        `Subscription ${subscription.id} is a credit trial subscription. To add a payment method to it, you must first upgrade to a paid plan.`
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

  const organization = await selectOrganizationById(
    checkoutSession.organizationId,
    transaction
  )

  return {
    type: CheckoutSessionType.AddPaymentMethod,
    purchase: null,
    price: null,
    product: null,
    billingRun: null,
    checkoutSession,
    organization,
    customer,
  }
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
  product: Product.Record
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
    transaction: DbTransaction
  ): Promise<
    TransactionOutput<ProcessSubscriptionCreatingCheckoutSessionSetupIntentSucceededResult>
  > => {
    if (!customer) {
      throw new Error(
        `Customer is required for setup intent ${setupIntent.id}`
      )
    }

    if (!isCheckoutSessionSubscriptionCreating(checkoutSession)) {
      throw new Error(
        `createSubscriptionFromSetupIntentableCheckoutSession: checkout session ${checkoutSession.id} is not supported because it is of type ${checkoutSession.type}.`
      )
    }
    /**
     * If the price, product, or purchase are not found,
     * we don't need to create a subscription because that means
     * the checkout session was for adding a payment method
     */
    if (!price) {
      throw new Error(
        `Price not found for setup intent ${setupIntent.id}, and checkout session ${checkoutSession.id} of type ${checkoutSession.type}. This should only happen for add payment method checkout sessions.`
      )
    }

    if (!product) {
      throw new Error(
        `Product not found for setup intent ${setupIntent.id}, and checkout session ${checkoutSession.id} of type ${checkoutSession.type}. This should only happen for add payment method checkout sessions.`
      )
    }

    if (!purchase) {
      throw new Error(
        `Purchase not found for setup intent ${setupIntent.id}, and checkout session ${checkoutSession.id} of type ${checkoutSession.type}. This should only happen for add payment method checkout sessions.`
      )
    }

    if (!price.intervalUnit) {
      throw new Error('Price interval unit is required')
    }

    if (!price.intervalCount) {
      throw new Error('Price interval count is required')
    }

    // Check for and cancel any free subscription before creating the new one
    const canceledFreeSubscription =
      await cancelFreeSubscriptionForUpgrade(customer.id, transaction)

    const subscriptionsForCustomer = await selectSubscriptions(
      {
        customerId: customer.id,
      },
      transaction
    )

    // Check for existing active paid subscriptions to prevent duplicate paid subscriptions
    // unless the organization allows multiple subscriptions per customer
    const activePaidSubscriptions = subscriptionsForCustomer.filter(
      (sub) =>
        sub.status === SubscriptionStatus.Active &&
        sub.isFreePlan === false &&
        sub.cancellationReason !== CancellationReason.UpgradedToPaid
    )

    if (
      activePaidSubscriptions.length > 0 &&
      !organization.allowMultipleSubscriptionsPerCustomer
    ) {
      throw new Error(
        `Customer ${customer.id} already has an active paid subscription. ` +
          `Cannot create another paid subscription. ` +
          `Existing subscription ID: ${activePaidSubscriptions[0].id}`
      )
    }
    const hasHadTrial = subscriptionsForCustomer.some(
      (subscription) => subscription.trialEnd
    )

    // Determine if we should preserve the billing cycle from the canceled free subscription
    const preserveBillingCycle =
      checkoutSession.preserveBillingCycleAnchor &&
      !!canceledFreeSubscription
    const startDate = Date.now()

    // Prepare billing cycle preservation parameters
    let billingCycleAnchorDate: number | undefined
    let preservedBillingPeriodEnd: number | undefined
    let preservedBillingPeriodStart: number | undefined
    let prorateFirstPeriod = false

    if (preserveBillingCycle) {
      billingCycleAnchorDate =
        canceledFreeSubscription.billingCycleAnchorDate || startDate
      preservedBillingPeriodEnd =
        canceledFreeSubscription.currentBillingPeriodEnd || undefined
      preservedBillingPeriodStart =
        canceledFreeSubscription.currentBillingPeriodStart ||
        undefined
      prorateFirstPeriod = true

      // Validate that we're not past the period end
      if (
        preservedBillingPeriodEnd &&
        startDate > preservedBillingPeriodEnd
      ) {
        // If we're past the period, don't preserve (start a new cycle)
        billingCycleAnchorDate = undefined
        preservedBillingPeriodEnd = undefined
        preservedBillingPeriodStart = undefined
        prorateFirstPeriod = false
      }
    }
    const now = Date.now()

    const output = await createSubscriptionWorkflow(
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
        billingCycleAnchorDate,
        preservedBillingPeriodEnd,
        preservedBillingPeriodStart,
        prorateFirstPeriod,
        autoStart: true,
        quantity: checkoutSession.quantity,
        metadata: checkoutSession.outputMetadata ?? {},
        name: checkoutSession.outputName ?? undefined,
        product,
        livemode: checkoutSession.livemode,
      },
      transaction
    )
    const eventInserts: Event.Insert[] = []
    if (output.eventsToInsert) {
      eventInserts.push(...output.eventsToInsert)
    }

    // Link the old and new subscriptions if there was an upgrade
    if (canceledFreeSubscription && output.result.subscription) {
      await linkUpgradedSubscriptions(
        canceledFreeSubscription,
        output.result.subscription.id,
        transaction
      )
      // Add upgrade event to the events to log
      const customer = await selectCustomerById(
        output.result.subscription.customerId,
        transaction
      )

      if (!customer) {
        throw new Error(
          `Customer not found for subscription ${output.result.subscription.id}`
        )
      }

      eventInserts.push({
        type: FlowgladEventType.SubscriptionCreated,
        occurredAt: now,
        organizationId: organization.id,
        livemode: output.result.subscription.livemode,
        metadata: {},
        submittedAt: now,
        processedAt: null,
        hash: constructSubscriptionCreatedEventHash(
          output.result.subscription
        ),
        payload: {
          object: EventNoun.Subscription,
          id: output.result.subscription.id,
          customer: {
            id: customer.id,
            externalId: customer.externalId,
          },
        },
      })
    }
    const updatedPurchase = await updatePurchase(
      {
        id: purchase.id,
        status: PurchaseStatus.Paid,
        priceType: price.type,
        purchaseDate: now,
      },
      transaction
    )

    eventInserts.push({
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

    return {
      ...output,
      eventsToInsert: eventInserts,
      result: {
        purchase: updatedPurchase,
        checkoutSession,
        billingRun: output.result.billingRun,
        price,
        product,
        organization,
        customer,
        type: checkoutSession.type,
      },
    }
  }

interface ProcessActivateSubscriptionCheckoutSessionSetupIntentSucceededResult {
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
    transaction: DbTransaction
  ): Promise<ProcessActivateSubscriptionCheckoutSessionSetupIntentSucceededResult> => {
    const initialCheckoutSession =
      await checkoutSessionFromSetupIntent(setupIntent, transaction)
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
      throw new Error(
        `processActivateSubscriptionCheckoutSessionSetupIntentSucceeded: Subscription not found for checkout session ${checkoutSession.id}`
      )
    }
    const customer = await selectCustomerById(
      result.subscription.customerId,
      transaction
    )
    const { paymentMethod } =
      await pullStripeSetupIntentDataToDatabase(
        setupIntent,
        customer,
        transaction
      )
    const { billingRun } = await activateSubscription(
      {
        subscription: result.subscription,
        subscriptionItems: result.subscriptionItems,
        defaultPaymentMethod: paymentMethod,
        autoStart: true,
      },
      transaction
    )
    return {
      type: CheckoutSessionType.ActivateSubscription as const,
      checkoutSession,
      organization: await selectOrganizationById(
        checkoutSession.organizationId,
        transaction
      ),
      customer: await selectCustomerById(
        checkoutSession.customerId!,
        transaction
      ),
      paymentMethod: await paymentMethodForStripePaymentMethodId(
        {
          stripePaymentMethodId: stripeIdFromObjectOrId(
            setupIntent.payment_method!
          ),
          livemode: checkoutSession.livemode,
          customerId: checkoutSession.customerId!,
        },
        transaction
      ),
      billingRun,
      subscription: result.subscription,
      purchase: null,
    }
  }

export const processSetupIntentSucceeded = async (
  setupIntent: CoreSripeSetupIntent,
  transaction: DbTransaction
): Promise<
  TransactionOutput<
    | ProcessSubscriptionCreatingCheckoutSessionSetupIntentSucceededResult
    | ProcessAddPaymentMethodSetupIntentSucceededResult
    | ProcessTerminalCheckoutSessionSetupIntentResult
    | ProcessActivateSubscriptionCheckoutSessionSetupIntentSucceededResult
  >
> => {
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
    const checkoutSession = await checkoutSessionFromSetupIntent(
      setupIntent,
      transaction
    )
    const customer = await selectCustomerById(
      subscription.customerId!,
      transaction
    )
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
      const organization = await selectOrganizationById(
        checkoutSession.organizationId,
        transaction
      )

      // Ensure payment method exists for activation
      if (!paymentMethod) {
        throw new Error(
          `processSetupIntentSucceeded: Payment method required for subscription activation (checkout session id: ${checkoutSession.id})`
        )
      }

      return {
        result: {
          type: CheckoutSessionType.ActivateSubscription,
          checkoutSession,
          organization,
          customer,
          paymentMethod,
          billingRun: null,
          subscription,
          purchase: null,
        },
        eventsToInsert: [],
      }
    }
    if (checkoutSession.type === CheckoutSessionType.Invoice) {
      throw new Error(
        `processSetupIntentSucceeded: Invoice checkout flow not supported (checkout session id: ${checkoutSession.id})`
      )
    }
    if (checkoutSession.type === CheckoutSessionType.Purchase) {
      throw new Error(
        `processSetupIntentSucceeded: Purchase checkout flow not supported (checkout session id: ${checkoutSession.id})`
      )
    }
    if (
      checkoutSession.type === CheckoutSessionType.AddPaymentMethod
    ) {
      throw new Error(
        `processSetupIntentSucceeded: Add payment method checkout flow not supported (checkout session id: ${checkoutSession.id})`
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
      throw new Error(
        `processSetupIntentSucceeded: Price not found for subscription (price id: ${subscription.priceId}, checkout session id: ${checkoutSession.id})`
      )
    }

    return {
      result: {
        type: checkoutSession.type,
        checkoutSession,
        price: priceResult[0].price,
        product: priceResult[0].product,
        organization: priceResult[0].organization,
        customer,
        billingRun: null,
        purchase: null,
      },
      eventsToInsert: [],
    }
  }

  const initialCheckoutSession = await checkoutSessionFromSetupIntent(
    setupIntent,
    transaction
  )

  if (checkoutSessionIsInTerminalState(initialCheckoutSession)) {
    const result = await processTerminalCheckoutSessionSetupIntent(
      initialCheckoutSession,
      transaction
    )
    return {
      result,
      eventsToInsert: [],
    }
  }

  if (
    initialCheckoutSession.type ===
    CheckoutSessionType.AddPaymentMethod
  ) {
    const result = await processAddPaymentMethodSetupIntentSucceeded(
      setupIntent,
      transaction
    )
    return {
      result,
      eventsToInsert: [],
    }
  }

  if (
    initialCheckoutSession.type ===
    CheckoutSessionType.ActivateSubscription
  ) {
    const result =
      await processActivateSubscriptionCheckoutSessionSetupIntentSucceeded(
        setupIntent,
        transaction
      )
    return {
      result,
      eventsToInsert: [],
    }
  }

  const successProcessedResult =
    await processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded(
      setupIntent,
      transaction
    )

  const withSetupIntent = Object.assign(successProcessedResult, {
    setupIntent,
  })

  return await createSubscriptionFromSetupIntentableCheckoutSession(
    withSetupIntent,
    transaction
  )
}
