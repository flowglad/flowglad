import { CheckoutSessionType, PriceType } from '@db-core/enums'
import { NotFoundError } from '@db-core/tableUtils'
import { Result } from 'better-result'
import type {
  CheckoutSession,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionObject,
} from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import {
  insertCheckoutSession,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectCustomerByExternalIdAndOrganizationId } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  selectPriceById,
  selectPriceBySlugAndCustomerId,
  selectPriceBySlugForDefaultPricingModel,
  selectPriceProductAndOrganizationByPriceWhere,
} from '@/db/tableMethods/priceMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'
import { ValidationError } from '@/errors'
import { CheckoutSessionStatus } from '@/types'
import core from '@/utils/core'
import {
  createPaymentIntentForCheckoutSession,
  createSetupIntentForCheckoutSession,
} from '@/utils/stripe'

export const checkoutSessionInsertFromInput = ({
  checkoutSessionInput,
  customer,
  organizationId,
  livemode,
  activateSubscriptionPriceId,
  resolvedPriceId,
}: {
  checkoutSessionInput: CreateCheckoutSessionObject
  customer: Customer.Record | null
  organizationId: string
  livemode: boolean
  activateSubscriptionPriceId?: string | null
  resolvedPriceId?: string
}): CheckoutSession.Insert => {
  const coreFields: Pick<
    CheckoutSession.Insert,
    | 'organizationId'
    | 'status'
    | 'livemode'
    | 'successUrl'
    | 'cancelUrl'
    | 'outputMetadata'
    | 'outputName'
    | 'automaticallyUpdateSubscriptions'
  > = {
    organizationId,
    status: CheckoutSessionStatus.Open,
    livemode,
    successUrl: checkoutSessionInput.successUrl,
    cancelUrl: checkoutSessionInput.cancelUrl,
    outputMetadata: checkoutSessionInput.outputMetadata ?? undefined,
    outputName: checkoutSessionInput.outputName,
    automaticallyUpdateSubscriptions: null,
  } as const

  const isAnonymous =
    'anonymous' in checkoutSessionInput &&
    checkoutSessionInput.anonymous === true

  if (checkoutSessionInput.type === CheckoutSessionType.Product) {
    if (!isAnonymous && !customer) {
      throw new Error(
        `Required customer not found for Product checkout (anonymous=false). externalId='${checkoutSessionInput.customerExternalId}', organization='${organizationId}'.`
      )
    }
    return {
      ...coreFields,
      automaticallyUpdateSubscriptions: null,
      type: CheckoutSessionType.Product,
      invoiceId: null,
      priceId: resolvedPriceId ?? checkoutSessionInput.priceId!,
      targetSubscriptionId: null,
      customerId: isAnonymous ? null : customer!.id,
      customerEmail: isAnonymous ? null : customer!.email,
      customerName: isAnonymous ? null : customer!.name,
      preserveBillingCycleAnchor:
        checkoutSessionInput.preserveBillingCycleAnchor ?? false,
      quantity: checkoutSessionInput.quantity ?? 1,
    }
  } else if (
    checkoutSessionInput.type === CheckoutSessionType.AddPaymentMethod
  ) {
    if (!customer) {
      throw new Error(
        'Customer is required for add payment method checkout sessions'
      )
    }
    return {
      ...coreFields,
      customerId: customer.id,
      customerEmail: customer.email,
      customerName: customer.name,
      automaticallyUpdateSubscriptions: false,
      type: CheckoutSessionType.AddPaymentMethod,
      targetSubscriptionId:
        checkoutSessionInput.targetSubscriptionId ?? null,
    }
  } else if (
    checkoutSessionInput.type ===
    CheckoutSessionType.ActivateSubscription
  ) {
    if (!customer) {
      throw new Error(
        'Customer is required for activate subscription checkout sessions'
      )
    }
    if (!activateSubscriptionPriceId) {
      throw new Error(
        'Activate subscription checkout sessions require a price derived from the target subscription'
      )
    }
    return {
      ...coreFields,
      priceId: activateSubscriptionPriceId,
      type: CheckoutSessionType.ActivateSubscription,
      targetSubscriptionId: checkoutSessionInput.targetSubscriptionId,
      purchaseId: null,
      invoiceId: null,
      customerId: customer.id,
      customerEmail: customer.email,
      customerName: customer.name,
      preserveBillingCycleAnchor:
        checkoutSessionInput.preserveBillingCycleAnchor ?? false,
    }
  }
  throw new Error(
    `Invalid checkout session, type: ${
      // @ts-expect-error - this is a type error because it should never be hit
      checkoutSessionInput.type
    }`
  )
}

export const createCheckoutSessionTransaction = async (
  {
    checkoutSessionInput,
    organizationId,
    livemode,
  }: {
    checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession']
    organizationId: string
    livemode: boolean
  },
  transaction: DbTransaction
): Promise<
  Result<
    {
      checkoutSession: CheckoutSession.Record
      url: string
    },
    ValidationError
  >
> => {
  // Only query for customer if customerExternalId is provided
  let customer: Customer.Record | null = null
  if (checkoutSessionInput.customerExternalId) {
    customer = await selectCustomerByExternalIdAndOrganizationId(
      {
        externalId: checkoutSessionInput.customerExternalId,
        organizationId,
      },
      transaction
    )
  }
  // Anonymous sessions can omit customerExternalId; in that case customer will be null
  // NOTE: invoice and purchase checkout sessions are not supported by API yet.
  let price: Price.Record | null = null
  let product: Product.Record | null = null
  let organization: Organization.Record | null = null
  let activateSubscriptionPriceId: string | null = null
  let resolvedPriceId: string | undefined

  if (checkoutSessionInput.type === CheckoutSessionType.Product) {
    // Resolve price ID from either priceId or priceSlug
    if (
      'priceSlug' in checkoutSessionInput &&
      checkoutSessionInput.priceSlug
    ) {
      const isAnonymous =
        'anonymous' in checkoutSessionInput &&
        checkoutSessionInput.anonymous === true

      if (isAnonymous) {
        // Anonymous checkout: use organization's default pricing model
        const priceFromSlug =
          await selectPriceBySlugForDefaultPricingModel(
            {
              slug: checkoutSessionInput.priceSlug,
              organizationId,
              livemode,
            },
            transaction
          )
        if (!priceFromSlug) {
          return Result.err(
            new ValidationError(
              'priceSlug',
              `Price with slug "${checkoutSessionInput.priceSlug}" not found in organization's default pricing model`
            )
          )
        }
        resolvedPriceId = priceFromSlug.id
      } else {
        // Identified customer: use customer's pricing model
        if (!customer) {
          return Result.err(
            new ValidationError(
              'customer',
              'Customer is required to resolve price slug for identified checkout sessions'
            )
          )
        }
        const priceFromSlug = await selectPriceBySlugAndCustomerId(
          {
            slug: checkoutSessionInput.priceSlug,
            customerId: customer.id,
          },
          transaction
        )
        if (!priceFromSlug) {
          return Result.err(
            new ValidationError(
              'priceSlug',
              `Price with slug "${checkoutSessionInput.priceSlug}" not found for customer's pricing model`
            )
          )
        }
        resolvedPriceId = priceFromSlug.id
      }
    } else if (checkoutSessionInput.priceId) {
      resolvedPriceId = checkoutSessionInput.priceId
    }

    const priceResult = await selectPriceById(
      resolvedPriceId!,
      transaction
    )
    if (Result.isError(priceResult)) {
      return Result.err(
        new ValidationError(
          'priceId',
          `Invalid or not-found price ID: no matching price found for id "${resolvedPriceId}"`
        )
      )
    }
    const resolvedPriceRecord = priceResult.unwrap()
    {
    }

    if (resolvedPriceRecord.type === PriceType.Usage) {
      return Result.err(
        new ValidationError(
          'priceId',
          'Checkout sessions are only supported for product prices (subscription/single payment), not usage prices'
        )
      )
    }

    const [result] =
      await selectPriceProductAndOrganizationByPriceWhere(
        { id: resolvedPriceId! },
        transaction
      )

    // When no result is found, the price doesn't exist or doesn't have a product attached.
    // Checkout sessions only support product prices (subscription/single_payment), so we expect
    // all valid checkout prices to have a product.
    if (!result) {
      return Result.err(
        new ValidationError(
          'priceId',
          `Invalid or not-found price ID: no matching price found for id "${resolvedPriceId}"`
        )
      )
    }

    price = result.price
    product = result.product
    organization = result.organization

    if (product.default) {
      return Result.err(
        new ValidationError(
          'product',
          'Checkout sessions cannot be created for default products. Default products are automatically assigned to customers and do not require manual checkout.'
        )
      )
    }
  } else {
    organization = (
      await selectOrganizationById(organizationId, transaction)
    ).unwrap()
    if (
      checkoutSessionInput.type ===
      CheckoutSessionType.ActivateSubscription
    ) {
      let targetSubscription
      try {
        targetSubscription = (
          await selectSubscriptionById(
            checkoutSessionInput.targetSubscriptionId,
            transaction
          )
        ).unwrap()
      } catch (error) {
        return Result.err(
          new ValidationError(
            'targetSubscriptionId',
            `Target subscription ${checkoutSessionInput.targetSubscriptionId} not found`
          )
        )
      }
      if (!customer) {
        return Result.err(
          new ValidationError(
            'customer',
            'Customer is required for activate subscription checkout sessions'
          )
        )
      }
      if (targetSubscription.organizationId !== organizationId) {
        return Result.err(
          new ValidationError(
            'targetSubscriptionId',
            `Target subscription ${targetSubscription.id} does not belong to organization ${organizationId}`
          )
        )
      }
      if (targetSubscription.customerId !== customer.id) {
        return Result.err(
          new ValidationError(
            'targetSubscriptionId',
            `Target subscription ${targetSubscription.id} does not belong to customer ${customer.id}`
          )
        )
      }
      if (!targetSubscription.priceId) {
        return Result.err(
          new ValidationError(
            'targetSubscriptionId',
            `Target subscription ${targetSubscription.id} does not have an associated price`
          )
        )
      }
      activateSubscriptionPriceId = targetSubscription.priceId
    }
  }

  let checkoutSessionInsert: CheckoutSession.Insert
  try {
    checkoutSessionInsert = checkoutSessionInsertFromInput({
      checkoutSessionInput,
      customer,
      organizationId,
      livemode,
      activateSubscriptionPriceId,
      resolvedPriceId,
    })
  } catch (error) {
    return Result.err(
      new ValidationError(
        'checkoutSession',
        error instanceof Error ? error.message : String(error)
      )
    )
  }
  const checkoutSessionResult = await insertCheckoutSession(
    checkoutSessionInsert,
    transaction
  )
  if (checkoutSessionResult.status === 'error') {
    return Result.err(checkoutSessionResult.error)
  }
  const checkoutSession = checkoutSessionResult.value

  let stripeSetupIntentId: string | null = null
  let stripePaymentIntentId: string | null = null
  if (
    // FIXME: Remove this once usage prices are deprecated
    price?.type === PriceType.Usage ||
    price?.type === PriceType.Subscription ||
    checkoutSession.type === CheckoutSessionType.AddPaymentMethod ||
    checkoutSession.type === CheckoutSessionType.ActivateSubscription
  ) {
    const stripeSetupIntent =
      await createSetupIntentForCheckoutSession({
        organization,
        checkoutSession,
        ...(customer ? { customer } : {}),
      })
    stripeSetupIntentId = stripeSetupIntent.id
  } else if (price?.type === PriceType.SinglePayment && product) {
    const paymentIntentResult =
      await createPaymentIntentForCheckoutSession({
        price,
        product,
        organization,
        checkoutSession,
        ...(customer ? { customer } : {}),
      })
    if (Result.isError(paymentIntentResult)) {
      return Result.err(paymentIntentResult.error)
    }
    stripePaymentIntentId = paymentIntentResult.value.id
  }
  const updatedCheckoutSession = await updateCheckoutSession(
    {
      ...checkoutSession,
      stripeSetupIntentId,
      stripePaymentIntentId,
    },
    transaction
  )
  const url =
    updatedCheckoutSession.type ===
    CheckoutSessionType.AddPaymentMethod
      ? `${core.NEXT_PUBLIC_APP_URL}/add-payment-method/${checkoutSession.id}`
      : `${core.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`
  return Result.ok({
    checkoutSession: updatedCheckoutSession,
    url,
  })
}
