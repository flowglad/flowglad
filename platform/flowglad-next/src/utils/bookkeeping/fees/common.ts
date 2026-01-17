import Stripe from 'stripe'
import type { Country } from '@/db/schema/countries'
import type { DiscountRedemption } from '@/db/schema/discountRedemptions'
import type { Discount } from '@/db/schema/discounts'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type {
  BillingAddress,
  Organization,
} from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Purchase } from '@/db/schema/purchases'
import { updateFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectLifetimeUsageForPayments } from '@/db/tableMethods/paymentMethods'
import type { DbTransaction } from '@/db/types'
import {
  CountryCode,
  CurrencyCode,
  DiscountAmountType,
  PaymentMethodType,
  PriceType,
  StripeConnectContractType,
} from '@/types'
import { isNil, nanoid } from '@/utils/core'
import {
  createStripeTaxCalculationByPrice,
  createStripeTaxCalculationByPurchase,
} from '@/utils/stripe'

/* Constants */
const CARD_CROSS_BORDER_FEE_PERCENTAGE = 1.5
const CARD_BASE_FEE_PERCENTAGE = 2.9
const CARD_FIXED_FEE_CENTS = 30
const BANK_ACCOUNT_FEE_PERCENTAGE = 0.8
const BANK_ACCOUNT_MAX_FEE_CENTS = 500
const SEPA_DEBIT_FEE_PERCENTAGE = 0.8
const SEPA_DEBIT_MAX_FEE_CENTS = 600
const MOR_SURCHARGE_PERCENTAGE = 1.1

/* Helper Functions */
export const parseFeePercentage = (feePercentage: string): number =>
  parseFloat(feePercentage)

export const calculatePercentageFee = (
  amount: number,
  percentage: number
): number => Math.round((amount * percentage) / 100)

export const validateNumericAmount = (
  amount: number,
  fieldName: string
): void => {
  if (isNaN(amount)) {
    throw Error(`${fieldName} is NaN`)
  }
}

/* Base Amount Calculations */
export const calculateInvoiceBaseAmount = (invoice: {
  invoiceLineItems: { price: number; quantity: number }[]
}): number => {
  return invoice.invoiceLineItems.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  )
}

export const calculatePriceBaseAmount = ({
  price,
  invoice,
  purchase,
}: {
  price: Price.ClientRecord
  invoice?: {
    invoiceLineItems: { price: number; quantity: number }[]
  } | null
  purchase?: Purchase.ClientRecord | null
}): number => {
  if (!purchase && !invoice) return price.unitPrice
  if (
    isNil(purchase?.firstInvoiceValue) &&
    isNil(purchase?.pricePerBillingCycle)
  )
    return price.unitPrice
  if (
    purchase.priceType === PriceType.SinglePayment &&
    purchase.firstInvoiceValue
  )
    return purchase.firstInvoiceValue
  if (
    purchase.priceType === PriceType.Subscription &&
    purchase.pricePerBillingCycle
  )
    return purchase.pricePerBillingCycle
  return price.unitPrice
}

/* Discount Calculations */
export const calculateDiscountAmount = (
  basePrice: number,
  discount?: Discount.ClientRecord | null
): number => {
  if (!discount) {
    return 0
  }
  if (discount.amountType === DiscountAmountType.Fixed) {
    return discount.amount
  }
  if (discount.amountType === DiscountAmountType.Percent) {
    return calculatePercentageFee(
      basePrice,
      Math.min(discount.amount, 100)
    )
  }
  return 0
}

export const calculateDiscountAmountFromRedemption = (
  baseAmount: number,
  redemption?: DiscountRedemption.Record
): number => {
  if (!redemption) return 0
  if (redemption.discountAmountType === DiscountAmountType.Fixed)
    return redemption.discountAmount
  return calculatePercentageFee(
    baseAmount,
    Math.min(redemption.discountAmount, 100)
  )
}

/* Fee Percentage Calculations */
export const calculateFlowgladFeePercentage = ({
  organization,
}: {
  organization: Organization.Record
}): number => parseFeePercentage(organization.feePercentage)

export const calculateMoRSurchargePercentage = ({
  organization,
}: {
  organization: Organization.Record
}): number => {
  if (
    organization.stripeConnectContractType ===
    StripeConnectContractType.MerchantOfRecord
  ) {
    return MOR_SURCHARGE_PERCENTAGE
  }
  return 0
}

export const calculateInternationalFeePercentage = ({
  paymentMethod,
  paymentMethodCountry,
  organization,
  organizationCountry,
}: {
  paymentMethod: PaymentMethodType
  paymentMethodCountry: CountryCode
  organization: Organization.Record
  organizationCountry: Country.Record
}): number => {
  if (
    organization.stripeConnectContractType ===
      StripeConnectContractType.MerchantOfRecord &&
    paymentMethodCountry.toUpperCase() === 'US'
  ) {
    return 0
  }
  const orgCode = organizationCountry.code.toUpperCase()
  const payCode = paymentMethodCountry.toUpperCase()
  const valid = Object.values(CountryCode)
    .map((c) => c.toUpperCase())
    .includes(payCode)
  if (!valid) {
    throw Error(
      `Billing address country ${payCode} is not in the list of country codes`
    )
  }
  if (orgCode === payCode) return 0
  if (
    paymentMethod === PaymentMethodType.Card ||
    paymentMethod === PaymentMethodType.SEPADebit
  ) {
    return CARD_CROSS_BORDER_FEE_PERCENTAGE
  }
  return 0
}

/* Payment Method Fee Calculations */
export const calculatePaymentMethodFeeAmount = (
  totalAmountToCharge: number,
  paymentMethod: PaymentMethodType
): number => {
  if (totalAmountToCharge <= 0) return 0
  switch (paymentMethod) {
    case PaymentMethodType.Card:
    case PaymentMethodType.Link:
      return Math.round(
        totalAmountToCharge * (CARD_BASE_FEE_PERCENTAGE / 100) +
          CARD_FIXED_FEE_CENTS
      )
    case PaymentMethodType.USBankAccount:
      return Math.round(
        Math.min(
          totalAmountToCharge * (BANK_ACCOUNT_FEE_PERCENTAGE / 100),
          BANK_ACCOUNT_MAX_FEE_CENTS
        )
      )
    case PaymentMethodType.SEPADebit:
      return Math.round(
        Math.min(
          totalAmountToCharge * (SEPA_DEBIT_FEE_PERCENTAGE / 100),
          SEPA_DEBIT_MAX_FEE_CENTS
        )
      )
    default:
      return Math.round(
        totalAmountToCharge * (CARD_BASE_FEE_PERCENTAGE / 100) +
          CARD_FIXED_FEE_CENTS
      )
  }
}

/* Tax Calculations */
export interface TaxCalculationResult {
  taxAmountFixed: number
  stripeTaxCalculationId: string | null
  stripeTaxTransactionId: string | null
}

export type TotalFeeAmountInput = Omit<
  Pick<
    FeeCalculation.Record,
    | 'baseAmount'
    | 'discountAmountFixed'
    | 'flowgladFeePercentage'
    | 'morSurchargePercentage'
    | 'internationalFeePercentage'
    | 'paymentMethodFeeFixed'
    | 'taxAmountFixed'
  >,
  'morSurchargePercentage'
> & { morSurchargePercentage?: string | null }

export const calculateTaxes = async ({
  discountInclusiveAmount,
  livemode,
  billingAddress,
  price,
  purchase,
}: {
  discountInclusiveAmount: number
  livemode: boolean
  billingAddress: BillingAddress
  price: Price.Record
  purchase?: Purchase.Record
}): Promise<TaxCalculationResult> => {
  if (discountInclusiveAmount === 0) {
    return {
      taxAmountFixed: 0,
      stripeTaxCalculationId: `notaxoverride_${nanoid()}`,
      stripeTaxTransactionId: null,
    }
  }
  const calc = purchase
    ? await createStripeTaxCalculationByPurchase({
        purchase,
        billingAddress,
        discountInclusiveAmount,
        price,
        livemode,
      })
    : await createStripeTaxCalculationByPrice({
        price,
        billingAddress,
        discountInclusiveAmount,
        livemode,
      })
  return {
    taxAmountFixed: calc.tax_amount_exclusive,
    stripeTaxCalculationId: calc.id,
    stripeTaxTransactionId: null,
  }
}

/* Total Fee and Due Amount Calculations */
export const calculateTotalFeeAmount = (
  feeCalculation: TotalFeeAmountInput
): number => {
  const {
    baseAmount,
    discountAmountFixed,
    flowgladFeePercentage,
    morSurchargePercentage,
    internationalFeePercentage,
    paymentMethodFeeFixed,
    taxAmountFixed,
  } = feeCalculation
  validateNumericAmount(baseAmount, 'Base amount')
  validateNumericAmount(
    discountAmountFixed ?? 0,
    'Discount amount fixed'
  )
  validateNumericAmount(
    parseFloat(morSurchargePercentage ?? '0'),
    'MoR surcharge percentage'
  )
  validateNumericAmount(
    parseFloat(internationalFeePercentage),
    'International fee percentage'
  )
  const safeDiscount = discountAmountFixed
    ? Math.max(discountAmountFixed, 0)
    : 0
  const discountInclusiveAmount = baseAmount - safeDiscount
  const flowFixed = calculatePercentageFee(
    discountInclusiveAmount,
    parseFloat(flowgladFeePercentage!)
  )
  const intlFixed = calculatePercentageFee(
    discountInclusiveAmount,
    parseFloat(internationalFeePercentage!)
  )
  const morSurchargeFixed = calculatePercentageFee(
    discountInclusiveAmount,
    parseFloat(morSurchargePercentage ?? '0')
  )
  return Math.round(
    flowFixed +
      morSurchargeFixed +
      intlFixed +
      paymentMethodFeeFixed +
      taxAmountFixed
  )
}

export const calculateTotalDueAmount = (
  feeCalculation: FeeCalculation.CustomerRecord
): number =>
  Math.max(
    feeCalculation.baseAmount -
      (feeCalculation.discountAmountFixed ?? 0) +
      feeCalculation.taxAmountFixed,
    0
  )

/* Notes & Finalization */
const generateFeeCalculationNotesWithCredits = ({
  currentTransactionAmount,
  finalFlowgladFeePercentage,
  totalProcessedLifetime,
  upfrontProcessingCredits,
}: {
  currentTransactionAmount: number
  finalFlowgladFeePercentage: number
  totalProcessedLifetime: number
  upfrontProcessingCredits: number
}): string => {
  const creditsRemainingBefore = Math.max(
    upfrontProcessingCredits - totalProcessedLifetime,
    0
  )
  const amountAfterCredits = Math.max(
    currentTransactionAmount - creditsRemainingBefore,
    0
  )

  const creditsPortionApplied = Math.min(
    currentTransactionAmount,
    creditsRemainingBefore
  )

  // If credits cover everything
  if (amountAfterCredits === 0) {
    return `No fee applied due to upfront processing credits. Credits applied: ${creditsPortionApplied}. Remaining credits before transaction: ${creditsRemainingBefore}.`
  }

  // Full fee applied on post-credit amount (no monthly free tier)
  return `Credits applied: ${creditsPortionApplied}. Full fee applied on post-credit amount ${amountAfterCredits}. Effective percentage on entire transaction: ${finalFlowgladFeePercentage.toPrecision(6)}%.`
}

export const finalizeFeeCalculation = async (
  feeCalculation: FeeCalculation.Record,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const lifetimeResolvedPayments =
    await selectLifetimeUsageForPayments(
      { organizationId: feeCalculation.organizationId },
      transaction
    )
  const organization = await selectOrganizationById(
    feeCalculation.organizationId,
    transaction
  )

  // Hard assume that the payments are processed in pennies.
  // We accept imprecision for Euros, and for other currencies.
  const totalProcessedLifetime = lifetimeResolvedPayments.reduce(
    (acc, payment) => acc + payment.amount,
    0
  )

  const organizationFeePercentage = parseFeePercentage(
    organization.feePercentage
  )
  const currentTransactionAmount = feeCalculation.pretaxTotal ?? 0

  // Step 1: Apply upfront processing credits first
  const creditsRemainingBefore = Math.max(
    organization.upfrontProcessingCredits - totalProcessedLifetime,
    0
  )
  const amountAfterCredits = Math.max(
    currentTransactionAmount - creditsRemainingBefore,
    0
  )

  // Step 2: All post-credit amount is chargeable (no monthly free tier)
  const chargeableAmount = amountAfterCredits

  const finalFlowgladFeePercentage =
    currentTransactionAmount > 0
      ? (organizationFeePercentage * chargeableAmount) /
        currentTransactionAmount
      : 0

  const internalNotes = generateFeeCalculationNotesWithCredits({
    currentTransactionAmount,
    finalFlowgladFeePercentage,
    totalProcessedLifetime,
    upfrontProcessingCredits: organization.upfrontProcessingCredits,
  })

  const feeCalculationUpdate = {
    id: feeCalculation.id,
    flowgladFeePercentage: finalFlowgladFeePercentage.toString(),
    type: feeCalculation.type,
    priceId: feeCalculation.priceId,
    billingPeriodId: feeCalculation.billingPeriodId,
    checkoutSessionId: feeCalculation.checkoutSessionId,
    internalNotes: `${internalNotes} Calculated time: ${new Date().toISOString()}`,
  } as FeeCalculation.Update

  return updateFeeCalculation(feeCalculationUpdate, transaction)
}
