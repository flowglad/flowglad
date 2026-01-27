import { Result } from 'better-result'
import BigNumber from 'bignumber.js'
import Stripe from 'stripe'
import { z } from 'zod'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Country } from '@/db/schema/countries'
import type { Customer } from '@/db/schema/customers'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type {
  BillingAddress,
  Organization,
} from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { Purchase } from '@/db/schema/purchases'
import { NotFoundError, ValidationError } from '@/errors'
import {
  BusinessOnboardingStatus,
  CountryCode,
  CurrencyCode,
  type Nullish,
  PaymentMethodType,
  StripeConnectContractType,
} from '@/types'
import {
  calculateTotalDueAmount,
  calculateTotalFeeAmount,
} from '@/utils/bookkeeping/fees/common'
import { stripeCall } from '@/utils/tracing'
import core from './core'

const DIGITAL_TAX_CODE = 'txcd_10000000'

export const zeroDecimalCurrencies = [
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]

export const stripeSupportedCurrencies: readonly CurrencyCode[] = [
  CurrencyCode.USD,
  CurrencyCode.AED,
  CurrencyCode.AFN,
  CurrencyCode.AMD,
  CurrencyCode.ANG,
  CurrencyCode.AUD,
  CurrencyCode.AWG,
  CurrencyCode.AZN,
  CurrencyCode.BAM,
  CurrencyCode.BBD,
  CurrencyCode.BDT,
  CurrencyCode.BGN,
  CurrencyCode.BIF,
  CurrencyCode.BMD,
  CurrencyCode.BND,
  CurrencyCode.BSD,
  CurrencyCode.BWP,
  CurrencyCode.BYN,
  CurrencyCode.BZD,
  CurrencyCode.CAD,
  CurrencyCode.CDF,
  CurrencyCode.CHF,
  CurrencyCode.CNY,
  CurrencyCode.CZK,
  CurrencyCode.DKK,
  CurrencyCode.DOP,
  CurrencyCode.DZD,
  CurrencyCode.EGP,
  CurrencyCode.ETB,
  CurrencyCode.EUR,
  CurrencyCode.FJD,
  CurrencyCode.GBP,
  CurrencyCode.GEL,
  CurrencyCode.GIP,
  CurrencyCode.GMD,
  CurrencyCode.GYD,
  CurrencyCode.HKD,
  CurrencyCode.HTG,
  CurrencyCode.HUF,
  CurrencyCode.IDR,
  CurrencyCode.ILS,
  CurrencyCode.INR,
  CurrencyCode.ISK,
  CurrencyCode.JMD,
  CurrencyCode.JPY,
  CurrencyCode.KES,
  CurrencyCode.KGS,
  CurrencyCode.KHR,
  CurrencyCode.KMF,
  CurrencyCode.KRW,
  CurrencyCode.KYD,
  CurrencyCode.KZT,
  CurrencyCode.LBP,
  CurrencyCode.LKR,
  CurrencyCode.LRD,
  CurrencyCode.LSL,
  CurrencyCode.MAD,
  CurrencyCode.MDL,
  CurrencyCode.MGA,
  CurrencyCode.MKD,
  CurrencyCode.MMK,
  CurrencyCode.MNT,
  CurrencyCode.MOP,
  CurrencyCode.MVR,
  CurrencyCode.MWK,
  CurrencyCode.MXN,
  CurrencyCode.MYR,
  CurrencyCode.MZN,
  CurrencyCode.NAD,
  CurrencyCode.NGN,
  CurrencyCode.NOK,
  CurrencyCode.NPR,
  CurrencyCode.NZD,
  CurrencyCode.PGK,
  CurrencyCode.PHP,
  CurrencyCode.PKR,
  CurrencyCode.PLN,
  CurrencyCode.QAR,
  CurrencyCode.RON,
  CurrencyCode.RSD,
  CurrencyCode.RUB,
  CurrencyCode.RWF,
  CurrencyCode.SAR,
  CurrencyCode.SBD,
  CurrencyCode.SCR,
  CurrencyCode.SEK,
  CurrencyCode.SGD,
  CurrencyCode.SLE,
  CurrencyCode.SOS,
  CurrencyCode.SZL,
  CurrencyCode.THB,
  CurrencyCode.TJS,
  CurrencyCode.TOP,
  CurrencyCode.TRY,
  CurrencyCode.TTD,
  CurrencyCode.TWD,
  CurrencyCode.TZS,
  CurrencyCode.UAH,
  CurrencyCode.UGX,
  CurrencyCode.UZS,
  CurrencyCode.VND,
  CurrencyCode.VUV,
  CurrencyCode.WST,
  CurrencyCode.XAF,
  CurrencyCode.XCD,
  CurrencyCode.YER,
  CurrencyCode.ZAR,
  CurrencyCode.ZMW,
]

export const isCurrencyZeroDecimal = (currency: CurrencyCode) => {
  return zeroDecimalCurrencies.includes(currency)
}

export const isCurrencySupported = (currency: CurrencyCode) => {
  return stripeSupportedCurrencies.includes(currency)
}

export const stripeCurrencyAmountToHumanReadableCurrencyAmount = (
  currency: CurrencyCode,
  amount: number
) => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  })
  if (!isCurrencyZeroDecimal(currency)) {
    return formatter.format(Number((amount / 100).toFixed(2)))
  }
  return formatter.format(amount)
}

/**
 * Returns currency symbol and formatted numeric value separately for a given amount.
 * Uses Intl.NumberFormat.formatToParts() for reliable i18n support with multi-character
 * currency symbols (e.g., CHF, SEK, CN¥, R$).
 */
// FIXME: This function is not Stripe-specific and should be moved to a more appropriate location
export const getCurrencyParts = (
  currency: CurrencyCode,
  amount: number,
  options?: { hideZeroCents?: boolean }
): { symbol: string; value: string } => {
  const adjustedAmount = isCurrencyZeroDecimal(currency)
    ? amount
    : amount / 100

  // When hideZeroCents is true, only hide .00 for whole amounts
  // (e.g., $40.00 → $40, but $39.50 stays $39.50, not $39.5)
  const isWholeAmount = adjustedAmount % 1 === 0
  const fractionDigits =
    options?.hideZeroCents && isWholeAmount
      ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : {}

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    ...fractionDigits,
  })

  const parts = formatter.formatToParts(adjustedAmount)
  const symbol =
    parts.find((p) => p.type === 'currency')?.value ?? '$'
  const value = parts
    .filter((p) =>
      [
        'minusSign',
        'integer',
        'group',
        'decimal',
        'fraction',
      ].includes(p.type)
    )
    .map((p) => p.value)
    .join('')

  return { symbol, value }
}

/**
 * Formats the billing period for display.
 * Handles singular/plural forms and interval counts.
 *
 * @param intervalUnit - The billing interval unit (e.g., 'month', 'year')
 * @param intervalCount - The number of intervals (e.g., 1, 3, 6)
 * @returns Formatted billing period string (e.g., 'month', '3 months', 'one-time')
 *
 * @example
 * formatBillingPeriod('month', 1) // 'month'
 * formatBillingPeriod('month', 3) // '3 months'
 * formatBillingPeriod(null, null) // 'one-time'
 */
// FIXME: This function is not Stripe-specific and should be moved to a more appropriate location
export const formatBillingPeriod = (
  intervalUnit: string | null | undefined,
  intervalCount: number | null | undefined
): string => {
  if (!intervalUnit) return 'one-time'

  const count = intervalCount || 1
  const unit = intervalUnit.toLowerCase()

  // Handle singular vs plural
  if (count === 1) {
    return unit
  }

  // Handle plural forms
  return `${count} ${unit}s`
}

// Constants for readability and maintainability
const THRESHOLDS = {
  SMALL_AMOUNT: 100,
  THOUSAND: 1000,
  MILLION: 1000000,
} as const

/**
 * Creates a currency formatter with specified decimal places
 */
const createCurrencyFormatter = (
  currency: CurrencyCode,
  decimals: number,
  useGrouping = true
) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping,
  })
}

/**
 * Determines decimal precision for K notation based on magnitude
 */
const getKNotationDecimals = (thousands: number): number => {
  return thousands >= 100 ? 1 : 2
}

/**
 * Determines decimal precision for M notation based on magnitude
 */
const getMNotationDecimals = (millions: number): number => {
  if (millions >= 100) return 0
  if (millions >= 10) return 1
  return 2
}

/**
 * Formats currency amounts with shortened notation for y-axis labels
 * Examples:
 * - $5.69 -> $5.69 (amounts under $100)
 * - $489.58 -> $490 (amounts $100-$999 rounded to nearest dollar)
 * - $9,325.69 -> $9.33K (thousands with K notation)
 * - $843,901.21 -> $843.9K (larger amounts with K notation)
 * - $2,843,901.21 -> $2.84M (millions with M notation)
 * - $23,843,901.21 -> $23.8M (larger millions with M notation)
 * - $490,239,321.24 -> $490M (hundreds of millions with M notation)
 */
export const stripeCurrencyAmountToShortReadableCurrencyAmount = (
  currency: CurrencyCode,
  amount: number
) => {
  // Convert from stripe cents format if needed
  const actualAmount = !isCurrencyZeroDecimal(currency)
    ? amount / 100
    : amount

  // For amounts under $100, show as-is with cents
  if (actualAmount < THRESHOLDS.SMALL_AMOUNT) {
    return createCurrencyFormatter(currency, 2).format(actualAmount)
  }

  // For amounts $100-$999, round to nearest dollar
  if (actualAmount < THRESHOLDS.THOUSAND) {
    const rounded = Math.round(actualAmount)
    // If rounding pushes us to $1000 or above, use K notation instead
    if (rounded >= THRESHOLDS.THOUSAND) {
      const thousands = actualAmount / THRESHOLDS.THOUSAND
      return (
        createCurrencyFormatter(currency, 2).format(thousands) + 'K'
      )
    }
    return createCurrencyFormatter(currency, 0).format(rounded)
  }

  // For amounts $1000-$999,999, use K notation
  if (actualAmount < THRESHOLDS.MILLION) {
    const thousands = actualAmount / THRESHOLDS.THOUSAND
    const decimals = getKNotationDecimals(thousands)

    // Check if rounding would result in >= 1000K, if so use M notation instead
    const roundedThousands =
      Math.round(thousands * 10 ** decimals) / 10 ** decimals
    if (roundedThousands >= THRESHOLDS.THOUSAND) {
      // Switch to M notation to avoid displaying "1000K" or higher
      const millions = actualAmount / THRESHOLDS.MILLION
      const millionDecimals = getMNotationDecimals(millions)
      // Disable grouping for large M values to avoid commas
      return (
        createCurrencyFormatter(
          currency,
          millionDecimals,
          false
        ).format(millions) + 'M'
      )
    }

    // Use the correct decimal precision based on the rounded value
    const finalDecimals = getKNotationDecimals(roundedThousands)
    return (
      createCurrencyFormatter(currency, finalDecimals).format(
        thousands
      ) + 'K'
    )
  }

  // For amounts $1,000,000+, use M notation
  const millions = actualAmount / THRESHOLDS.MILLION
  const decimals = getMNotationDecimals(millions)
  // Disable grouping for large M values to avoid commas like $1,000M
  return (
    createCurrencyFormatter(currency, decimals, false).format(
      millions
    ) + 'M'
  )
}

export const countableCurrencyAmountToRawStringAmount = (
  currencyCode: CurrencyCode,
  amount: number
) => {
  if (isCurrencyZeroDecimal(currencyCode)) {
    return amount.toString()
  }
  return (amount / 100).toFixed(2)
}

export const rawStringAmountToCountableCurrencyAmount = (
  currencyCode: CurrencyCode,
  amount: string
) => {
  if (isCurrencyZeroDecimal(currencyCode)) {
    return Number(amount)
  }
  return Math.round(Number(amount) * 100)
}

const stripeApiKey = (livemode: boolean) => {
  // Allow integration tests to use real Stripe API key
  // This env var is only set when running integration tests
  if (process.env.STRIPE_INTEGRATION_TEST_MODE === 'true') {
    const key = process.env.STRIPE_TEST_MODE_SECRET_KEY
    if (!key) {
      throw new Error(
        'STRIPE_INTEGRATION_TEST_MODE is enabled but STRIPE_TEST_MODE_SECRET_KEY is not set. ' +
          'Integration tests require a valid Stripe test mode secret key.'
      )
    }
    return key
  }
  if (core.IS_TEST) {
    return 'sk_test_fake_key_1234567890abcdef'
  }
  return livemode
    ? core.envVariable('STRIPE_SECRET_KEY')
    : core.envVariable('STRIPE_TEST_MODE_SECRET_KEY') || ''
}
export const stripe = (livemode: boolean) => {
  return new Stripe(stripeApiKey(livemode), {
    apiVersion: '2024-09-30.acacia',
    httpClient: core.IS_TEST
      ? Stripe.createFetchHttpClient()
      : undefined,
  })
}

export const createConnectedAccount = async ({
  countryCode,
  organization,
  livemode,
}: {
  organization: Organization.Record
  countryCode: CountryCode
  livemode: boolean
}) => {
  /**
   * US accounts need to accept the full terms of service, even for MoR arrangements
   * @see https://docs.stripe.com/connect/cross-border-payouts#restrictions-and-requirements
   */
  const useRecipientAgreement =
    organization.stripeConnectContractType ===
      StripeConnectContractType.MerchantOfRecord &&
    countryCode !== CountryCode.US
  const tos_acceptance: Stripe.AccountCreateParams.TosAcceptance =
    useRecipientAgreement
      ? {
          service_agreement: 'recipient',
        }
      : {}
  /**
   * Delay payouts for merchant of record connections
   */
  const settings: Stripe.AccountCreateParams.Settings =
    organization.stripeConnectContractType ===
    StripeConnectContractType.MerchantOfRecord
      ? {
          payouts: {
            schedule: {
              delay_days: 7,
              interval: 'weekly',
              weekly_anchor: 'monday',
            },
          },
        }
      : {}
  /**
   * For merchant of record connections, we can only request transfers.
   *
   * For platform connections, we must also request card_payments to allow us to make
   * destination on_behalf_of payments.
   */
  const capabilities: Stripe.AccountCreateParams.Capabilities =
    organization.stripeConnectContractType ===
    StripeConnectContractType.MerchantOfRecord
      ? {
          transfers: {
            requested: true,
          },
        }
      : {
          transfers: {
            requested: true,
          },
          card_payments: {
            requested: true,
          },
        }
  return stripeCall(
    'accounts.create',
    {
      'stripe.country': countryCode,
      'stripe.livemode': livemode,
    },
    () =>
      stripe(livemode).accounts.create({
        country: countryCode,
        capabilities,
        settings,
        controller: {
          stripe_dashboard: {
            type: 'express',
          },
          fees: {
            payer: 'application',
          },
          losses: {
            payments: 'application',
          },
          requirement_collection: 'stripe',
        },
        tos_acceptance,
      })
  )
}
export const createAccountOnboardingLink = async (
  account: string,
  livemode: boolean
) => {
  const accountLink = await stripeCall(
    'accountLinks.create',
    {
      'stripe.account_id': account,
      'stripe.livemode': livemode,
    },
    () =>
      stripe(livemode).accountLinks.create({
        account,
        refresh_url: core.safeUrl(
          `/onboarding`,
          core.envVariable('NEXT_PUBLIC_APP_URL')
        ),
        return_url: core.safeUrl(
          `/onboarding`,
          core.envVariable('NEXT_PUBLIC_APP_URL')
        ),
        type: 'account_onboarding',
        collection_options: {
          fields: 'eventually_due',
        },
      })
  )
  return accountLink.url
}

/**
 * Calculate the platform application fee for a given subtotal.
 * Should be used for destination charges on behalf of, where
 * we aren't going to be collecting + remitting taxes.
 *
 * This should never be the FINAL calculation, as we will need
 * to confirm the payment method first.
 *
 * Uses BigNumber for precise decimal arithmetic to avoid floating point errors.
 * @param params
 * @returns
 */
export const calculatePlatformApplicationFee = (params: {
  organization: Organization.Record
  subtotal: number
  currency: CurrencyCode
}) => {
  const { organization, subtotal } = params
  // Use BigNumber to avoid floating point precision issues
  // e.g., parseFloat("0.65") / 100 = 0.006500000000000001
  const takeRate = new BigNumber(
    organization.feePercentage
  ).dividedBy(100)
  const stripeFeeRate = new BigNumber('0.029')
  const fixedFeeCents = new BigNumber(50)

  return new BigNumber(subtotal)
    .times(takeRate.plus(stripeFeeRate))
    .plus(fixedFeeCents)
    .integerValue(BigNumber.ROUND_CEIL)
    .toNumber()
}

export const stripeIdFromObjectOrId = (
  objectOrId: { id: string } | string
): string => {
  if (typeof objectOrId === 'string') {
    return objectOrId
  }
  return objectOrId.id
}

export const getConnectedAccount = async (
  accountId: string,
  livemode: boolean
) => {
  return stripeCall(
    'accounts.retrieve',
    {
      'stripe.account_id': accountId,
      'stripe.livemode': livemode,
    },
    () => stripe(livemode).accounts.retrieve(accountId)
  )
}

export const unitedStatesBankAccountPaymentMethodOptions = (
  bankPaymentOnly: Nullish<boolean>
): Pick<
  Stripe.PaymentIntentCreateParams | Stripe.SetupIntentCreateParams,
  'payment_method_types' | 'payment_method_options'
> => {
  const bankOnlyParams: Pick<
    Stripe.PaymentIntentCreateParams | Stripe.SetupIntentCreateParams,
    'payment_method_types' | 'payment_method_options'
  > = {
    payment_method_types: ['us_bank_account'],
    payment_method_options: {
      us_bank_account: {
        financial_connections: {
          permissions: ['payment_method'],
        },
      },
    },
  }
  return bankPaymentOnly ? bankOnlyParams : {}
}

/**
 * First attempts to get the payment intent from the live mode Stripe API.
 * If that fails, attempts to get the payment intent from the test mode Stripe API.
 * @param paymentIntentId
 * @param livemode
 * @returns
 */
export const getPaymentIntent = async (paymentIntentId: string) => {
  let paymentIntent: Stripe.PaymentIntent
  try {
    paymentIntent = await stripeCall(
      'paymentIntents.retrieve',
      {
        'stripe.payment_intent_id': paymentIntentId,
        'stripe.livemode': true,
      },
      () => stripe(true).paymentIntents.retrieve(paymentIntentId)
    )
  } catch (err) {
    paymentIntent = await stripeCall(
      'paymentIntents.retrieve',
      {
        'stripe.payment_intent_id': paymentIntentId,
        'stripe.livemode': false,
      },
      () => stripe(false).paymentIntents.retrieve(paymentIntentId)
    )
  }
  return paymentIntent
}

export type StripeIntent = Stripe.PaymentIntent | Stripe.SetupIntent

export enum IntentMetadataType {
  CheckoutSession = 'checkout_session',
  BillingRun = 'billing_run',
}

/**
 * Fee breakdown metadata schema for Stripe Payment Intents.
 * Included for MoR transactions to provide visibility in Stripe dashboard.
 */
export const feeMetadataSchema = z.object({
  flowglad_fee_percentage: z.string().optional(),
  mor_surcharge_percentage: z.string().optional(),
  international_fee_percentage: z.string().optional(),
  tax_amount: z.string().optional(),
  stripe_tax_calculation_id: z.string().optional(),
})

export type FeeMetadata = z.infer<typeof feeMetadataSchema>

/**
 * Builds fee breakdown metadata from a FeeCalculation record for
 * inclusion in Stripe Payment Intent metadata.
 */
export const buildFeeMetadata = (
  feeCalculation: FeeCalculation.Record | undefined
): FeeMetadata => {
  if (!feeCalculation) {
    return {}
  }
  return {
    flowglad_fee_percentage: feeCalculation.flowgladFeePercentage,
    mor_surcharge_percentage: feeCalculation.morSurchargePercentage,
    international_fee_percentage:
      feeCalculation.internationalFeePercentage,
    tax_amount: feeCalculation.taxAmountFixed.toString(),
    stripe_tax_calculation_id:
      feeCalculation.stripeTaxCalculationId ?? undefined,
  }
}

export const checkoutSessionIntentMetadataSchema = z.object({
  checkoutSessionId: z.string(),
  type: z.literal(IntentMetadataType.CheckoutSession),
})

export const billingRunIntentMetadataSchema = z.object({
  billingRunId: z.string(),
  type: z.literal(IntentMetadataType.BillingRun),
  billingPeriodId: z.string(),
})

export const stripeIntentMetadataSchema = z
  .discriminatedUnion('type', [
    checkoutSessionIntentMetadataSchema,
    billingRunIntentMetadataSchema,
  ])
  .or(z.undefined())
  .or(z.null())

export type StripeIntentMetadata = z.infer<
  typeof stripeIntentMetadataSchema
>

export type CheckoutSessionStripeIntentMetadata = z.infer<
  typeof checkoutSessionIntentMetadataSchema
>

export type BillingRunStripeIntentMetadata = z.infer<
  typeof billingRunIntentMetadataSchema
>

const stripeConnectTransferDataForOrganization = ({
  organization,
  livemode,
}: {
  organization: Organization.Record
  livemode: boolean
}): Result<
  {
    on_behalf_of: string | undefined
    transfer_data:
      | Stripe.PaymentIntentCreateParams['transfer_data']
      | undefined
  },
  ValidationError
> => {
  const stripeAccountId = organization.stripeAccountId
  let on_behalf_of: string | undefined

  let transfer_data:
    | Stripe.PaymentIntentCreateParams['transfer_data']
    | undefined

  if (livemode) {
    if (!stripeAccountId) {
      return Result.err(
        new ValidationError(
          'organization',
          `Organization ${organization.id} does not have a Stripe account ID. Stripe account setup is a prerequisite for live mode payments.`
        )
      )
    }
    if (!organization.payoutsEnabled) {
      return Result.err(
        new ValidationError(
          'organization',
          `Organization ${organization.id} does not have payouts enabled.`
        )
      )
    }
    if (
      organization.stripeConnectContractType ===
      StripeConnectContractType.Platform
    ) {
      on_behalf_of = stripeAccountId
    }
    transfer_data = {
      destination: stripeAccountId,
    }
  }
  return Result.ok({
    on_behalf_of,
    transfer_data,
  })
}

export const constructStripeWebhookEvent = (params: {
  payload: string | Buffer
  signature: string
  signingSecret: string
  livemode: boolean
}) => {
  return stripe(params.livemode).webhooks.constructEvent(
    params.payload,
    params.signature,
    params.signingSecret
  )
}

export const getStripeInvoiceAndInvoiceLineItemsForPaymentIntent =
  async (
    paymentIntent: Stripe.PaymentIntent,
    livemode: boolean
  ): Promise<{
    invoice: Stripe.Invoice | null
    lineItems: Stripe.InvoiceLineItem[] | null
  }> => {
    if (!paymentIntent.invoice) {
      return { invoice: null, lineItems: null }
    }

    const invoiceId = stripeIdFromObjectOrId(paymentIntent.invoice)
    const invoice = await stripe(livemode).invoices.retrieve(
      invoiceId,
      {
        expand: ['lines'],
      }
    )

    return {
      invoice,
      lineItems: invoice.lines.data,
    }
  }

export const createStripeCustomer = async (params: {
  email: string
  name: string
  organizationId: string
  livemode: boolean
  createdBy: 'createCustomerBookkeeping' | 'confirmCheckoutSession'
}) => {
  return stripeCall(
    'customers.create',
    {
      'stripe.org_id': params.organizationId,
      'stripe.livemode': params.livemode,
    },
    () =>
      stripe(params.livemode).customers.create({
        email: params.email,
        name: params.name,
        metadata: {
          organizationId: params.organizationId,
          createdBy: params.createdBy,
        },
      })
  )
}

/**
 * Creates a Stripe CustomerSession for a customer to enable saved payment method features.
 *
 * CustomerSessions enable the PaymentElement to display saved payment methods and allow
 * users to save new payment methods for future checkouts. This is used when a customer
 * already exists with a Stripe customer ID and the PaymentIntent or SetupIntent is
 * associated with that customer.
 *
 * @param customer - The customer record with stripeCustomerId set
 * @returns Result containing the client_secret for the CustomerSession, which should be passed to the
 *          PaymentElement's options.customerSessionClientSecret
 *
 * @example
 * ```typescript
 * const result = await createCustomerSessionForCheckout(customer)
 * if (Result.isOk(result)) {
 *   const customerSessionClientSecret = result.value
 *   // Pass to PaymentElement:
 *   // <PaymentElement options={{ customerSessionClientSecret }} />
 * }
 * ```
 */
export const createCustomerSessionForCheckout = async (
  customer: Customer.Record
): Promise<Result<string, NotFoundError>> => {
  if (!customer.stripeCustomerId) {
    return Result.err(
      new NotFoundError(
        'stripeCustomerId',
        'Missing stripeCustomerId for customer session creation'
      )
    )
  }
  const customerSession = await stripeCall(
    'customerSessions.create',
    {
      'stripe.customer_id': customer.stripeCustomerId,
      'stripe.livemode': customer.livemode,
    },
    () =>
      stripe(customer.livemode).customerSessions.create({
        customer: customer.stripeCustomerId!,
        components: {
          payment_element: {
            enabled: true,
            features: {
              payment_method_redisplay: 'enabled',
            },
          },
        },
      })
  )
  return Result.ok(customerSession.client_secret)
}

export const createStripeTaxCalculationByPrice = async ({
  price,
  billingAddress,
  discountInclusiveAmount,
  livemode,
}: {
  price: Price.Record
  billingAddress: BillingAddress
  discountInclusiveAmount: number
  livemode: boolean
}): Promise<
  Pick<Stripe.Tax.Calculation, 'id' | 'tax_amount_exclusive'>
> => {
  // Allow integration tests to use real Stripe Tax API
  if (
    core.IS_TEST &&
    process.env.STRIPE_INTEGRATION_TEST_MODE !== 'true'
  ) {
    return {
      id: `testtaxcalc_${core.nanoid()}`,
      tax_amount_exclusive: 0,
    }
  }
  const lineItems: Stripe.Tax.CalculationCreateParams.LineItem[] = [
    {
      quantity: 1,
      amount: discountInclusiveAmount,
      reference: `${price.id}`,
      tax_code: DIGITAL_TAX_CODE,
    },
  ]

  // Strip the 'name' field from address as Stripe Tax API doesn't accept it
  const { name: _name, ...stripeAddress } = billingAddress.address
  return stripeCall(
    'tax.calculations.create',
    {
      'stripe.currency': price.currency,
      'stripe.livemode': livemode,
    },
    () =>
      stripe(livemode).tax.calculations.create({
        customer_details: {
          address: stripeAddress,
          address_source: 'billing',
        },
        currency: price.currency,
        line_items: lineItems,
      })
  )
}

export const createStripeTaxCalculationByPurchase = async ({
  purchase,
  billingAddress,
  discountInclusiveAmount,
  price,
  livemode,
}: {
  purchase: Purchase.Record
  billingAddress: BillingAddress
  discountInclusiveAmount: number
  price: Price.Record
  livemode: boolean
}): Promise<
  Pick<Stripe.Tax.Calculation, 'id' | 'tax_amount_exclusive'>
> => {
  // Allow integration tests to use real Stripe Tax API
  if (
    core.IS_TEST &&
    process.env.STRIPE_INTEGRATION_TEST_MODE !== 'true'
  ) {
    return {
      id: `testtaxcalc_${core.nanoid()}`,
      tax_amount_exclusive: 0,
    }
  }
  const lineItems: Stripe.Tax.CalculationCreateParams.LineItem[] = [
    {
      quantity: 1,
      amount: discountInclusiveAmount,
      reference: `${purchase.id}`,
      tax_code: DIGITAL_TAX_CODE,
    },
  ]
  // Strip the 'name' field from address as Stripe Tax API doesn't accept it
  const { name: _name, ...stripeAddress } = billingAddress.address
  return stripeCall(
    'tax.calculations.create',
    {
      'stripe.currency': price.currency,
      'stripe.livemode': livemode,
    },
    () =>
      stripe(livemode).tax.calculations.create({
        customer_details: {
          address: stripeAddress,
          address_source: 'billing',
        },
        currency: price.currency,
        line_items: lineItems,
      })
  )
}

export const getStripeTaxCalculation = async (
  id: string,
  livemode: boolean
) => {
  return stripeCall(
    'tax.calculations.retrieve',
    {
      'stripe.calculation_id': id,
      'stripe.livemode': livemode,
    },
    () => stripe(livemode).tax.calculations.retrieve(id)
  )
}

export const createStripeTaxTransactionFromCalculation = async ({
  stripeTaxCalculationId,
  reference,
  livemode,
}: {
  stripeTaxCalculationId: string | null
  reference: string
  livemode: boolean
}): Promise<Stripe.Tax.Transaction | null> => {
  if (
    !stripeTaxCalculationId ||
    stripeTaxCalculationId.startsWith('notaxoverride_') ||
    stripeTaxCalculationId.startsWith('testtaxcalc_')
  ) {
    return null
  }
  return stripeCall(
    'tax.transactions.createFromCalculation',
    {
      'stripe.calculation_id': stripeTaxCalculationId,
      'stripe.livemode': livemode,
    },
    () =>
      stripe(livemode).tax.transactions.createFromCalculation(
        {
          calculation: stripeTaxCalculationId,
          reference,
        },
        {
          idempotencyKey: `tax_txn_from_calc_${reference}`,
        }
      )
  )
}

/**
 * Reverses a Stripe Tax Transaction when a refund occurs.
 * This is required for MOR to properly report tax reversals.
 *
 * @see https://docs.stripe.com/tax/custom#record-tax-reversals
 */
export const reverseStripeTaxTransaction = async ({
  stripeTaxTransactionId,
  reference,
  livemode,
  mode,
  flatAmount,
}: {
  stripeTaxTransactionId: string
  reference: string
  livemode: boolean
  mode: 'full' | 'partial'
  flatAmount?: number
}): Promise<Stripe.Tax.Transaction | null> => {
  // Skip reversal for test tax transactions or missing IDs
  if (
    !stripeTaxTransactionId ||
    stripeTaxTransactionId.startsWith('notaxoverride_') ||
    stripeTaxTransactionId.startsWith('testtaxcalc_')
  ) {
    return null
  }

  const params: Stripe.Tax.TransactionCreateReversalParams = {
    original_transaction: stripeTaxTransactionId,
    reference,
    mode,
    ...(mode === 'partial' && flatAmount
      ? { flat_amount: flatAmount }
      : {}),
  }

  return stripeCall(
    'tax.transactions.createReversal',
    {
      'stripe.tax_transaction_id': stripeTaxTransactionId,
      'stripe.livemode': livemode,
    },
    () =>
      stripe(livemode).tax.transactions.createReversal(params, {
        idempotencyKey: `tax_reversal_${reference}`,
      })
  )
}

const deriveFullyOnboardedStatusFromStripeAccount = (
  account: Stripe.Account
): boolean => {
  if (!account.tos_acceptance?.date) {
    return false
  }
  /**
   * MOR accounts use the recipient service agreement,
   * which doesn't allow them to have card payments.
   */
  if (account.tos_acceptance?.service_agreement === 'recipient') {
    return (
      account.capabilities?.transfers === 'active' &&
      account.payouts_enabled
    )
  }
  /**
   * Platform / self-settlement accounts can have
   * card payments, and their accounts
   * have no tos_acceptance.service_agreement property
   */
  return (
    account.capabilities?.card_payments === 'active' &&
    account.capabilities?.transfers === 'active' &&
    account.payouts_enabled
  )
}

export const getConnectedAccountOnboardingStatus = async (
  accountId: string,
  livemode: boolean
) => {
  const account = await stripeCall(
    'accounts.retrieve',
    {
      'stripe.account_id': accountId,
      'stripe.livemode': livemode,
    },
    () => stripe(livemode).accounts.retrieve(accountId)
  )

  const requirements = account.requirements
  const remainingFields = requirements?.currently_due || []
  const pastDueFields = requirements?.past_due || []
  const pendingVerificationFields =
    requirements?.pending_verification || []
  const eventuallyDueFields = requirements?.eventually_due || []
  const isFullyOnboarded =
    deriveFullyOnboardedStatusFromStripeAccount(account)
  const payoutsEnabled = account.capabilities?.transfers === 'active'
  let onboardingStatus = BusinessOnboardingStatus.FullyOnboarded
  if (!isFullyOnboarded) {
    onboardingStatus = BusinessOnboardingStatus.PartiallyOnboarded
  } else if (!payoutsEnabled) {
    onboardingStatus = BusinessOnboardingStatus.Unauthorized
  }
  return {
    requirements,
    eventuallyDueFields,
    onboardingStatus,
    remainingFields,
    pastDueFields,
    pendingVerificationFields,
    payoutsEnabled,
  }
}

export type StripeAccountOnboardingStatus = Awaited<
  ReturnType<typeof getConnectedAccountOnboardingStatus>
> | null

export const createPaymentIntentForCheckoutSession = async (params: {
  price: Price.Record
  organization: Organization.Record
  product: Product.Record
  purchase?: Purchase.Record
  checkoutSession: CheckoutSession.Record
  feeCalculation?: FeeCalculation.Record
  customer?: Customer.Record
}): Promise<
  Result<Stripe.Response<Stripe.PaymentIntent>, ValidationError>
> => {
  const {
    price,
    organization,
    checkoutSession,
    feeCalculation,
    customer,
  } = params
  const livemode = checkoutSession.livemode
  const transferDataResult = stripeConnectTransferDataForOrganization(
    {
      organization,
      livemode,
    }
  )
  if (Result.isError(transferDataResult)) {
    return Result.err(transferDataResult.error)
  }
  const transferData = transferDataResult.value
  const feeMetadata = buildFeeMetadata(feeCalculation)
  const metadata: CheckoutSessionStripeIntentMetadata & FeeMetadata =
    {
      checkoutSessionId: checkoutSession.id,
      type: IntentMetadataType.CheckoutSession,
      ...feeMetadata,
    }
  const totalDue = feeCalculation
    ? await calculateTotalDueAmount(feeCalculation)
    : price.unitPrice * checkoutSession.quantity
  const totalFeeAmount = feeCalculation
    ? calculateTotalFeeAmount(feeCalculation)
    : calculatePlatformApplicationFee({
        organization,
        subtotal: price.unitPrice * checkoutSession.quantity,
        currency: price.currency,
      })

  const paymentIntent = await stripeCall(
    'paymentIntents.create',
    {
      'stripe.amount': totalDue,
      'stripe.currency': price.currency,
      'stripe.livemode': livemode,
    },
    () =>
      stripe(livemode).paymentIntents.create({
        amount: totalDue,
        currency: price.currency,
        application_fee_amount: livemode ? totalFeeAmount : undefined,
        ...transferData,
        metadata,
        customer: customer?.stripeCustomerId ?? undefined,
      })
  )
  return Result.ok(paymentIntent)
}

export const getLatestChargeForPaymentIntent = async (
  paymentIntent: Stripe.PaymentIntent,
  livemode: boolean
): Promise<Stripe.Charge | null> => {
  const { latest_charge } = paymentIntent
  if (!latest_charge) {
    return null
  }
  if (typeof latest_charge === 'string') {
    return stripeCall(
      'charges.retrieve',
      {
        'stripe.charge_id': latest_charge,
        'stripe.livemode': livemode,
      },
      () => stripe(livemode).charges.retrieve(latest_charge)
    )
  }
  return latest_charge
}

export const dateFromStripeTimestamp = (timestamp: number) => {
  return new Date(timestamp * 1000)
}

export const paymentMethodFromStripeCharge = (
  charge: Stripe.Charge
): Result<PaymentMethodType, NotFoundError | ValidationError> => {
  const paymentMethodDetails = charge.payment_method_details
  if (!paymentMethodDetails) {
    return Result.err(
      new NotFoundError(
        'paymentMethodDetails',
        'No payment method details found for charge'
      )
    )
  }
  switch (paymentMethodDetails.type) {
    case 'card':
      return Result.ok(PaymentMethodType.Card)
    case 'card_present':
      return Result.ok(PaymentMethodType.Card)
    case 'ach_debit':
      return Result.ok(PaymentMethodType.USBankAccount)
    case 'us_bank_account':
      return Result.ok(PaymentMethodType.USBankAccount)
    case 'sepa_debit':
      return Result.ok(PaymentMethodType.SEPADebit)
    case 'link':
      return Result.ok(PaymentMethodType.Link)
    default:
      return Result.err(
        new ValidationError(
          'paymentMethodType',
          `Unknown payment method type: ${paymentMethodDetails.type}`
        )
      )
  }
}

/**
 * First attempts to get the setup intent from the live mode Stripe API.
 * If that fails, attempts to get the setup intent from the test mode Stripe API.
 * @param setupIntentId
 * @returns
 */
export const getSetupIntent = async (setupIntentId: string) => {
  let setupIntent: Stripe.SetupIntent
  try {
    setupIntent = await stripeCall(
      'setupIntents.retrieve',
      {
        'stripe.setup_intent_id': setupIntentId,
        'stripe.livemode': true,
      },
      () => stripe(true).setupIntents.retrieve(setupIntentId)
    )
  } catch (err) {
    setupIntent = await stripeCall(
      'setupIntents.retrieve',
      {
        'stripe.setup_intent_id': setupIntentId,
        'stripe.livemode': false,
      },
      () => stripe(false).setupIntents.retrieve(setupIntentId)
    )
  }
  return setupIntent
}

export const updateSetupIntent = async (
  setupIntentId: string,
  params: Pick<Stripe.SetupIntentUpdateParams, 'customer'>,
  livemode: boolean
) => {
  return stripeCall(
    'setupIntents.update',
    {
      'stripe.setup_intent_id': setupIntentId,
      'stripe.livemode': livemode,
    },
    () => stripe(livemode).setupIntents.update(setupIntentId, params)
  )
}

export const updatePaymentIntent = async (
  paymentIntentId: string,
  params: Pick<
    Stripe.PaymentIntentUpdateParams,
    | 'customer'
    | 'amount'
    | 'metadata'
    | 'application_fee_amount'
    | 'setup_future_usage'
  >,
  livemode: boolean
) => {
  const applicationFeeAmount = livemode
    ? params.application_fee_amount
    : undefined
  return stripeCall(
    'paymentIntents.update',
    {
      'stripe.payment_intent_id': paymentIntentId,
      'stripe.livemode': livemode,
    },
    () =>
      stripe(livemode).paymentIntents.update(paymentIntentId, {
        ...params,
        application_fee_amount: applicationFeeAmount,
      })
  )
}

export const confirmPaymentIntent = async (
  paymentIntentId: string,
  livemode: boolean
) => {
  return stripeCall(
    'paymentIntents.confirm',
    {
      'stripe.payment_intent_id': paymentIntentId,
      'stripe.livemode': livemode,
    },
    () => stripe(livemode).paymentIntents.confirm(paymentIntentId)
  )
}

export const cancelPaymentIntent = async (
  paymentIntentId: string,
  livemode: boolean
) => {
  return stripeCall(
    'paymentIntents.cancel',
    {
      'stripe.payment_intent_id': paymentIntentId,
      'stripe.livemode': livemode,
    },
    () => stripe(livemode).paymentIntents.cancel(paymentIntentId)
  )
}

export const getStripeCharge = async (chargeId: string) => {
  let charge: Stripe.Charge
  try {
    charge = await stripeCall(
      'charges.retrieve',
      {
        'stripe.charge_id': chargeId,
        'stripe.livemode': true,
      },
      () => stripe(true).charges.retrieve(chargeId)
    )
  } catch (err) {
    charge = await stripeCall(
      'charges.retrieve',
      {
        'stripe.charge_id': chargeId,
        'stripe.livemode': false,
      },
      () => stripe(false).charges.retrieve(chargeId)
    )
  }
  return charge
}

export const getStripeSubscription = async (
  subscriptionId: string,
  livemode: boolean
) => {
  return stripeCall(
    'subscriptions.retrieve',
    {
      'stripe.subscription_id': subscriptionId,
      'stripe.livemode': livemode,
    },
    () => stripe(livemode).subscriptions.retrieve(subscriptionId)
  )
}

export const refundPayment = async (
  stripePaymentIntentId: string,
  partialAmount: number | null,
  livemode: boolean
): Promise<Result<Stripe.Refund, NotFoundError>> => {
  const paymentIntent = await stripeCall(
    'paymentIntents.retrieve',
    {
      'stripe.payment_intent_id': stripePaymentIntentId,
      'stripe.livemode': livemode,
    },
    () =>
      stripe(livemode).paymentIntents.retrieve(stripePaymentIntentId)
  )
  if (!paymentIntent.latest_charge) {
    return Result.err(
      new NotFoundError(
        'charge',
        'No charge found for payment intent'
      )
    )
  }

  const chargeId =
    typeof paymentIntent.latest_charge === 'string'
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge.id

  // Retrieve the charge to check if it has an associated transfer
  const charge = await stripeCall(
    'charges.retrieve',
    {
      'stripe.charge_id': chargeId,
      'stripe.livemode': livemode,
    },
    () => stripe(livemode).charges.retrieve(chargeId)
  )
  const hasTransfer = Boolean(charge.transfer)

  const refund = await stripeCall(
    'refunds.create',
    {
      'stripe.payment_intent_id': stripePaymentIntentId,
      'stripe.livemode': livemode,
    },
    () =>
      stripe(livemode).refunds.create({
        charge: chargeId,
        amount: partialAmount ?? undefined,
        /**
         * Only reverse the transfer if one exists.
         * In MoR test mode, payments may not have transfers.
         */
        reverse_transfer: hasTransfer ? true : undefined,
      })
  )
  return Result.ok(refund)
}

export const listRefundsForCharge = async (
  chargeId: string,
  livemode: boolean
) => {
  return stripeCall(
    'refunds.list',
    {
      'stripe.charge_id': chargeId,
      'stripe.livemode': livemode,
    },
    () =>
      stripe(livemode).refunds.list({
        charge: chargeId,
      })
  )
}

// export const createPaymentIntentForBillingRun = async (params: {
//   amount: number
//   currency: CurrencyCode
//   stripeCustomerId: string
//   stripePaymentMethodId: string
//   livemode: boolean
//   billingRunId: string
//   billingPeriodId: string
//   feeCalculation: FeeCalculation.Record
// }) => {
//   const metadata: BillingRunStripeIntentMetadata = {
//     billingRunId: params.billingRunId,
//     type: IntentMetadataType.BillingRun,
//     billingPeriodId: params.billingPeriodId,
//   }

//   return stripe(params.livemode).paymentIntents.create({
//     amount: params.amount,
//     currency: params.currency,
//     customer: params.stripeCustomerId,
//     payment_method: params.stripePaymentMethodId,
//     confirm: false,
//     metadata,
//   })
// }
/**
 * To be used for subscription payments executed during the billing
 * run workflow
 * @param param0
 * @returns
 */
export const createAndConfirmPaymentIntentForBillingRun = async ({
  amount,
  currency,
  stripeCustomerId,
  stripePaymentMethodId,
  billingPeriodId,
  billingRunId,
  feeCalculation,
  organization,
  livemode,
}: {
  amount: number
  currency: CurrencyCode
  stripeCustomerId: string
  stripePaymentMethodId: string
  billingPeriodId: string
  billingRunId: string
  feeCalculation: FeeCalculation.Record
  organization: Organization.Record
  livemode: boolean
}): Promise<
  Result<Stripe.Response<Stripe.PaymentIntent>, ValidationError>
> => {
  if (!organization.stripeAccountId && livemode) {
    return Result.err(
      new ValidationError(
        'organization',
        `createAndConfirmPaymentIntent: Organization ${organization.id} does not have a Stripe account ID`
      )
    )
  }
  const totalFeeAmount = calculateTotalFeeAmount(feeCalculation)
  const feeMetadata = buildFeeMetadata(feeCalculation)
  const metadata: BillingRunStripeIntentMetadata & FeeMetadata = {
    billingRunId,
    type: IntentMetadataType.BillingRun,
    billingPeriodId,
    ...feeMetadata,
  }
  const transferDataResult = stripeConnectTransferDataForOrganization(
    {
      organization,
      livemode,
    }
  )
  if (Result.isError(transferDataResult)) {
    return Result.err(transferDataResult.error)
  }
  const transferData = transferDataResult.value

  const applicationFeeAmount = livemode ? totalFeeAmount : undefined
  const paymentIntent = await stripeCall(
    'paymentIntents.create',
    {
      'stripe.amount': amount,
      'stripe.currency': currency,
      'stripe.livemode': livemode,
      'stripe.confirm': true,
    },
    () =>
      stripe(livemode).paymentIntents.create({
        amount,
        currency,
        customer: stripeCustomerId,
        payment_method: stripePaymentMethodId,
        // NOTE: `off_session: true` *requires* `confirm: true` (not doing this will
        // result in 400 errors). Keep this in mind when changing this code.
        confirm: true,
        off_session: true,
        application_fee_amount: applicationFeeAmount,
        metadata,
        automatic_payment_methods: {
          enabled: true,
        },
        ...transferData,
      })
  )
  return Result.ok(paymentIntent)
}

export const createPaymentIntentForBillingRun = async ({
  amount,
  currency,
  stripeCustomerId,
  stripePaymentMethodId,
  billingPeriodId,
  billingRunId,
  feeCalculation,
  organization,
  livemode,
}: {
  amount: number
  currency: CurrencyCode
  stripeCustomerId: string
  stripePaymentMethodId: string
  billingPeriodId: string
  billingRunId: string
  feeCalculation: FeeCalculation.Record
  organization: Organization.Record
  livemode: boolean
}): Promise<
  Result<Stripe.Response<Stripe.PaymentIntent>, ValidationError>
> => {
  if (!organization.stripeAccountId && livemode) {
    return Result.err(
      new ValidationError(
        'organization',
        `createPaymentIntentForBillingRun: Organization ${organization.id} does not have a Stripe account ID`
      )
    )
  }
  const totalFeeAmount = calculateTotalFeeAmount(feeCalculation)
  const feeMetadata = buildFeeMetadata(feeCalculation)
  const metadata: BillingRunStripeIntentMetadata & FeeMetadata = {
    billingRunId,
    type: IntentMetadataType.BillingRun,
    billingPeriodId,
    ...feeMetadata,
  }
  const transferDataResult = stripeConnectTransferDataForOrganization(
    {
      organization,
      livemode,
    }
  )
  if (Result.isError(transferDataResult)) {
    return Result.err(transferDataResult.error)
  }
  const transferData = transferDataResult.value

  const applicationFeeAmount = livemode ? totalFeeAmount : undefined

  // Create payment intent WITHOUT confirming
  const paymentIntent = await stripeCall(
    'paymentIntents.create',
    {
      'stripe.amount': amount,
      'stripe.currency': currency,
      'stripe.livemode': livemode,
    },
    () =>
      stripe(livemode).paymentIntents.create({
        amount,
        currency,
        customer: stripeCustomerId,
        payment_method: stripePaymentMethodId,
        // NOTE: `off_session: true` *requires* `confirm: true` (not doing this will
        // result in 400 errors). Keep this in mind when changing this code.
        confirm: false, // Don't confirm yet
        application_fee_amount: applicationFeeAmount,
        metadata,
        automatic_payment_methods: {
          enabled: true,
        },
        ...transferData,
      })
  )
  return Result.ok(paymentIntent)
}

export const confirmPaymentIntentForBillingRun = async (
  paymentIntentId: string,
  livemode: boolean
) => {
  // Confirm the payment intent with Stripe
  return stripeCall(
    'paymentIntents.confirm',
    {
      'stripe.payment_intent_id': paymentIntentId,
      'stripe.livemode': livemode,
    },
    () =>
      stripe(livemode).paymentIntents.confirm(paymentIntentId, {
        // NOTE: `off_session: true` *requires* `confirm: true` (not doing this will
        // result in 400 errors). Keep this in mind when changing this code.
        off_session: true,
      })
  )
}

export const getStripePaymentMethod = async (
  paymentMethodId: string,
  livemode: boolean
) => {
  return stripeCall(
    'paymentMethods.retrieve',
    {
      'stripe.payment_method_id': paymentMethodId,
      'stripe.livemode': livemode,
    },
    () => stripe(livemode).paymentMethods.retrieve(paymentMethodId)
  )
}

export const getStripeProduct = async (
  productId: string,
  livemode: boolean
) => {
  return stripeCall(
    'products.retrieve',
    {
      'stripe.product_id': productId,
      'stripe.livemode': livemode,
    },
    () => stripe(livemode).products.retrieve(productId)
  )
}

export const getStripePrice = async (
  priceId: string,
  livemode: boolean
) => {
  return stripeCall(
    'prices.retrieve',
    {
      'stripe.price_id': priceId,
      'stripe.livemode': livemode,
    },
    () => stripe(livemode).prices.retrieve(priceId)
  )
}

/**
 * Used to create a setup intent for a purchase session,
 * meaning to create an intent for an anonymized customer to create a subscription.
 */
export const createSetupIntentForCheckoutSession = async (params: {
  organization: Organization.Record
  checkoutSession: CheckoutSession.Record
  purchase?: Purchase.Record
  customer?: Customer.Record
}) => {
  const { checkoutSession, organization, purchase, customer } = params
  const metadata: CheckoutSessionStripeIntentMetadata = {
    checkoutSessionId: checkoutSession.id,
    type: IntentMetadataType.CheckoutSession,
  }
  const bankOnly = purchase?.bankPaymentOnly
  const bankOnlyParams = unitedStatesBankAccountPaymentMethodOptions(
    bankOnly
  ) as Partial<Stripe.SetupIntentCreateParams>
  /**
   * If the organization is on a Merchant of Record contract, the default params
   * should be empty, because this is how you tell Stripe to use
   * the account's existing default payment method config.
   *
   * If the organization is on a standard platform contract, the default params
   * should enable automatic payment methods, because we need to collect payment
   * method information from the customer up front.
   */
  const defaultParams =
    organization.stripeConnectContractType ===
    StripeConnectContractType.MerchantOfRecord
      ? {}
      : {
          automatic_payment_methods: {
            enabled: true,
          },
        }
  const bankPaymentOnlyParams = bankOnly
    ? bankOnlyParams
    : defaultParams
  /**
   * On behalf of required to comply with SCA
   */
  const onBehalfOf =
    checkoutSession.livemode &&
    organization.stripeConnectContractType ===
      StripeConnectContractType.Platform
      ? organization.stripeAccountId!
      : undefined

  return stripeCall(
    'setupIntents.create',
    {
      'stripe.customer_id': customer?.stripeCustomerId ?? undefined,
      'stripe.livemode': checkoutSession.livemode,
    },
    () =>
      stripe(checkoutSession.livemode).setupIntents.create({
        ...bankPaymentOnlyParams,
        customer: customer?.stripeCustomerId ?? undefined,
        metadata,
        on_behalf_of: onBehalfOf,
      })
  )
}

export const defaultCurrencyForCountry = (
  country: Country.Record
) => {
  switch (country.code) {
    case CountryCode.AE:
      return CurrencyCode.AED
    case CountryCode.AF:
      return CurrencyCode.AFN
    case CountryCode.AL:
      return CurrencyCode.ALL
    case CountryCode.AM:
      return CurrencyCode.AMD
    case CountryCode.AO:
      return CurrencyCode.AOA
    case CountryCode.AR:
      return CurrencyCode.ARS
    case CountryCode.AU:
      return CurrencyCode.AUD
    case CountryCode.AZ:
      return CurrencyCode.AZN
    case CountryCode.BA:
      return CurrencyCode.BAM
    case CountryCode.BB:
      return CurrencyCode.BBD
    case CountryCode.BD:
      return CurrencyCode.BDT
    case CountryCode.BG:
      return CurrencyCode.BGN
    case CountryCode.BI:
      return CurrencyCode.BIF
    case CountryCode.BM:
      return CurrencyCode.BMD
    case CountryCode.BN:
      return CurrencyCode.BND
    case CountryCode.BO:
      return CurrencyCode.BOB
    case CountryCode.BR:
      return CurrencyCode.BRL
    case CountryCode.BS:
      return CurrencyCode.BSD
    case CountryCode.BW:
      return CurrencyCode.BWP
    case CountryCode.BY:
      return CurrencyCode.BYN
    case CountryCode.BZ:
      return CurrencyCode.BZD
    case CountryCode.CA:
      return CurrencyCode.CAD
    case CountryCode.CD:
      return CurrencyCode.CDF
    case CountryCode.CH:
      return CurrencyCode.CHF
    case CountryCode.CL:
      return CurrencyCode.CLP
    case CountryCode.CN:
      return CurrencyCode.CNY
    case CountryCode.CO:
      return CurrencyCode.COP
    case CountryCode.CR:
      return CurrencyCode.CRC
    case CountryCode.CV:
      return CurrencyCode.CVE
    case CountryCode.CZ:
      return CurrencyCode.CZK
    case CountryCode.DJ:
      return CurrencyCode.DJF
    case CountryCode.DK:
      return CurrencyCode.DKK
    case CountryCode.DO:
      return CurrencyCode.DOP
    case CountryCode.DZ:
      return CurrencyCode.DZD
    case CountryCode.EG:
      return CurrencyCode.EGP
    case CountryCode.ET:
      return CurrencyCode.ETB
    /**
     * EU Countries
     */
    case CountryCode.AT:
    case CountryCode.BE:
    case CountryCode.DE:
    case CountryCode.EE:
    case CountryCode.ES:
    case CountryCode.FI:
    case CountryCode.FR:
    case CountryCode.GR:
    case CountryCode.IE:
    case CountryCode.IT:
    case CountryCode.LT:
    case CountryCode.LU:
    case CountryCode.LV:
    case CountryCode.MT:
    case CountryCode.NL:
    case CountryCode.PT:
    case CountryCode.SI:
    case CountryCode.SK:
      return CurrencyCode.EUR
    case CountryCode.FJ:
      return CurrencyCode.FJD
    case CountryCode.FK:
      return CurrencyCode.FKP
    case CountryCode.GB:
      return CurrencyCode.GBP
    case CountryCode.GE:
      return CurrencyCode.GEL
    case CountryCode.GI:
      return CurrencyCode.GIP
    case CountryCode.GM:
      return CurrencyCode.GMD
    case CountryCode.GN:
      return CurrencyCode.GNF
    case CountryCode.GT:
      return CurrencyCode.GTQ
    case CountryCode.GY:
      return CurrencyCode.GYD
    case CountryCode.HK:
      return CurrencyCode.HKD
    case CountryCode.HN:
      return CurrencyCode.HNL
    case CountryCode.HT:
      return CurrencyCode.HTG
    case CountryCode.HU:
      return CurrencyCode.HUF
    case CountryCode.ID:
      return CurrencyCode.IDR
    case CountryCode.IL:
      return CurrencyCode.ILS
    case CountryCode.IN:
      return CurrencyCode.INR
    case CountryCode.IS:
      return CurrencyCode.ISK
    case CountryCode.JM:
      return CurrencyCode.JMD
    case CountryCode.JP:
      return CurrencyCode.JPY
    case CountryCode.KE:
      return CurrencyCode.KES
    case CountryCode.KG:
      return CurrencyCode.KGS
    case CountryCode.KH:
      return CurrencyCode.KHR
    case CountryCode.KM:
      return CurrencyCode.KMF
    case CountryCode.KR:
      return CurrencyCode.KRW
    case CountryCode.KY:
      return CurrencyCode.KYD
    case CountryCode.KZ:
      return CurrencyCode.KZT
    case CountryCode.LA:
      return CurrencyCode.LAK
    case CountryCode.LB:
      return CurrencyCode.LBP
    case CountryCode.LK:
      return CurrencyCode.LKR
    case CountryCode.LR:
      return CurrencyCode.LRD
    case CountryCode.LS:
      return CurrencyCode.LSL
    case CountryCode.MA:
      return CurrencyCode.MAD
    case CountryCode.MD:
      return CurrencyCode.MDL
    case CountryCode.MG:
      return CurrencyCode.MGA
    case CountryCode.MK:
      return CurrencyCode.MKD
    case CountryCode.MM:
      return CurrencyCode.MMK
    case CountryCode.MN:
      return CurrencyCode.MNT
    case CountryCode.MO:
      return CurrencyCode.MOP
    case CountryCode.MU:
      return CurrencyCode.MUR
    case CountryCode.MV:
      return CurrencyCode.MVR
    case CountryCode.MW:
      return CurrencyCode.MWK
    case CountryCode.MX:
      return CurrencyCode.MXN
    case CountryCode.MY:
      return CurrencyCode.MYR
    case CountryCode.MZ:
      return CurrencyCode.MZN
    case CountryCode.NA:
      return CurrencyCode.NAD
    case CountryCode.NG:
      return CurrencyCode.NGN
    case CountryCode.NI:
      return CurrencyCode.NIO
    case CountryCode.NO:
      return CurrencyCode.NOK
    case CountryCode.NP:
      return CurrencyCode.NPR
    case CountryCode.NZ:
      return CurrencyCode.NZD
    case CountryCode.PA:
      return CurrencyCode.PAB
    case CountryCode.PE:
      return CurrencyCode.PEN
    case CountryCode.PG:
      return CurrencyCode.PGK
    case CountryCode.PH:
      return CurrencyCode.PHP
    case CountryCode.PK:
      return CurrencyCode.PKR
    case CountryCode.PL:
      return CurrencyCode.PLN
    case CountryCode.PY:
      return CurrencyCode.PYG
    case CountryCode.QA:
      return CurrencyCode.QAR
    case CountryCode.RO:
      return CurrencyCode.RON
    case CountryCode.RS:
      return CurrencyCode.RSD
    case CountryCode.RU:
      return CurrencyCode.RUB
    case CountryCode.RW:
      return CurrencyCode.RWF
    case CountryCode.SA:
      return CurrencyCode.SAR
    case CountryCode.SB:
      return CurrencyCode.SBD
    case CountryCode.SC:
      return CurrencyCode.SCR
    case CountryCode.SE:
      return CurrencyCode.SEK
    case CountryCode.SG:
      return CurrencyCode.SGD
    case CountryCode.SH:
      return CurrencyCode.SHP
    case CountryCode.SO:
      return CurrencyCode.SOS
    case CountryCode.SR:
      return CurrencyCode.SRD
    case CountryCode.ST:
      return CurrencyCode.STD
    case CountryCode.SZ:
      return CurrencyCode.SZL
    case CountryCode.TH:
      return CurrencyCode.THB
    case CountryCode.TJ:
      return CurrencyCode.TJS
    case CountryCode.TO:
      return CurrencyCode.TOP
    case CountryCode.TR:
      return CurrencyCode.TRY
    case CountryCode.TT:
      return CurrencyCode.TTD
    case CountryCode.TW:
      return CurrencyCode.TWD
    case CountryCode.TZ:
      return CurrencyCode.TZS
    case CountryCode.UA:
      return CurrencyCode.UAH
    case CountryCode.UG:
      return CurrencyCode.UGX
    case CountryCode.US:
      return CurrencyCode.USD
    case CountryCode.UY:
      return CurrencyCode.UYU
    case CountryCode.UZ:
      return CurrencyCode.UZS
    case CountryCode.VN:
      return CurrencyCode.VND
    case CountryCode.VU:
      return CurrencyCode.VUV
    case CountryCode.WS:
      return CurrencyCode.WST
    case CountryCode.YE:
      return CurrencyCode.YER
    case CountryCode.ZA:
      return CurrencyCode.ZAR
    case CountryCode.ZM:
      return CurrencyCode.ZMW
    default:
      return CurrencyCode.USD
  }
}

/**
 * Generates the Stripe Connect OAuth authorization URL.
 *
 * @param state - The encoded OAuth state parameter (contains CSRF token)
 * @returns The full Stripe OAuth authorization URL
 */
export const getStripeOAuthUrl = (state: string) => {
  return `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${core.envVariable('STRIPE_CONNECT_CLIENT_ID')}&scope=read_write&state=${encodeURIComponent(state)}`
}

export const completeStripeOAuthFlow = async (params: {
  code: string
}) => {
  return stripeCall(
    'oauth.token',
    {
      'stripe.livemode': true,
    },
    () =>
      stripe(true).oauth.token({
        grant_type: 'authorization_code',
        code: params.code,
      })
  )
}
