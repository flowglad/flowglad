import {
  selectCustomerById,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PurchaseStatus,
  SubscriptionStatus,
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
import { updatePurchase } from '@/db/tableMethods/purchaseMethods'
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
}): Date | undefined => {
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
    : new Date(
        new Date().getTime() + trialPeriodDays * 24 * 60 * 60 * 1000
      )
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
        status: subscription.status,
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
  purchase: Purchase.Record
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
    }: SetupIntentSucceededBookkeepingResult & {
      setupIntent: CoreSripeSetupIntent
    },
    transaction: DbTransaction
  ): Promise<
    TransactionOutput<ProcessSubscriptionCreatingCheckoutSessionSetupIntentSucceededResult>
  > => {
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

    const subscriptionsForCustomer = await selectSubscriptions(
      {
        customerId: customer.id,
      },
      transaction
    )
    const hasHadTrial = subscriptionsForCustomer.some(
      (subscription) => subscription.trialEnd
    )

    const output = await createSubscriptionWorkflow(
      {
        stripeSetupIntentId: setupIntent.id,
        defaultPaymentMethod: paymentMethod,
        organization,
        price,
        customer,
        interval: price.intervalUnit,
        intervalCount: price.intervalCount,
        /**
         * If the price has a trial period, set the trial end date to the
         * end of the period
         */
        trialEnd: calculateTrialEnd({
          hasHadTrial,
          trialPeriodDays: price.trialPeriodDays,
        }),
        startDate: new Date(),
        autoStart: true,
        quantity: checkoutSession.quantity,
        metadata: checkoutSession.outputMetadata,
        name: checkoutSession.outputName ?? undefined,
        product,
        livemode: checkoutSession.livemode,
      },
      transaction
    )

    const updatedPurchase = await updatePurchase(
      {
        id: purchase.id,
        status: PurchaseStatus.Paid,
        priceType: price.type,
        purchaseDate: new Date(),
      },
      transaction
    )

    return {
      ...output,
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

export const processSetupIntentSucceeded = async (
  setupIntent: CoreSripeSetupIntent,
  transaction: DbTransaction
): Promise<
  TransactionOutput<
    | ProcessSubscriptionCreatingCheckoutSessionSetupIntentSucceededResult
    | ProcessAddPaymentMethodSetupIntentSucceededResult
    | ProcessTerminalCheckoutSessionSetupIntentResult
  >
> => {
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
      eventsToLog: [],
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
      eventsToLog: [],
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
