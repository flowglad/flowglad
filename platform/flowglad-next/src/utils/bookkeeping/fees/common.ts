import { BillingAddress } from '@/db/schema/organizations'
import { Discount } from '@/db/schema/discounts'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Purchase } from '@/db/schema/purchases'
import { Price } from '@/db/schema/prices'
import {
  CountryCode,
  DiscountAmountType,
  PriceType,
  StripeConnectContractType,
  PaymentMethodType,
} from '@/types'
import { DbTransaction } from '@/db/types'
import {
  createStripeTaxCalculationByPurchase,
  createStripeTaxCalculationByPrice,
} from '@/utils/stripe'
import { isNil, nanoid } from '@/utils/core'
import {
  updateFeeCalculation,
} from '@/db/tableMethods/feeCalculationMethods'
import { DiscountRedemption } from '@/db/schema/discountRedemptions'
import { Country } from '@/db/schema/countries'
import {
  selectLifetimeUsageForPayments,
  selectResolvedPaymentsMonthToDate,
} from '@/db/tableMethods/paymentMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'

/* Constants */
const CARD_CROSS_BORDER_FEE_PERCENTAGE = 1.5
const CARD_BASE_FEE_PERCENTAGE = 2.9
const CARD_FIXED_FEE_CENTS = 30
const BANK_ACCOUNT_FEE_PERCENTAGE = 0.8
const BANK_ACCOUNT_MAX_FEE_CENTS = 500
const SEPA_DEBIT_FEE_PERCENTAGE = 0.8
const SEPA_DEBIT_MAX_FEE_CENTS = 600

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

export const calculateTaxes = async ({
  discountInclusiveAmount,
  product,
  billingAddress,
  price,
  purchase,
}: {
  discountInclusiveAmount: number
  product: Product.Record
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
        product,
        livemode: product.livemode,
      })
    :       await createStripeTaxCalculationByPrice({
        price,
        billingAddress,
        discountInclusiveAmount,
        livemode: product.livemode,
      })
  return {
    taxAmountFixed: calc.tax_amount_exclusive,
    stripeTaxCalculationId: calc.id!,
    stripeTaxTransactionId: null,
  }
}

/* Total Fee and Due Amount Calculations */
export const calculateTotalFeeAmount = (
  feeCalculation: FeeCalculation.Record
): number => {
  const {
    baseAmount,
    discountAmountFixed,
    flowgladFeePercentage,
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
  return Math.round(
    flowFixed + intlFixed + paymentMethodFeeFixed + taxAmountFixed
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
export const generateFeeCalculationNotes = (
  totalProcessedMonthToDate: number,
  currentTransactionAmount: number,
  monthlyFreeTier: number,
  finalFlowgladFeePercentage: number
): string => {
  const newTotal =
    totalProcessedMonthToDate + currentTransactionAmount
  if (monthlyFreeTier <= totalProcessedMonthToDate)
    return `Full fee applied. Processed this month before transaction: ${totalProcessedMonthToDate}. Free tier: ${monthlyFreeTier}.`
  if (newTotal <= monthlyFreeTier)
    return `No fee applied. Processed this month after transaction: ${newTotal}. Free tier: ${monthlyFreeTier}.`
  const overage = newTotal - monthlyFreeTier
  return `Partial fee applied. Overage: ${overage}. Processed this month before transaction: ${totalProcessedMonthToDate}. Free tier: ${monthlyFreeTier}. Effective percentage: ${finalFlowgladFeePercentage.toPrecision(6)}%.`
}

const generateFeeCalculationNotesWithCredits = ({
  totalProcessedMonthToDate,
  currentTransactionAmount,
  monthlyFreeTier,
  finalFlowgladFeePercentage,
  totalProcessedLifetime,
  upfrontProcessingCredits,
}: {
  totalProcessedMonthToDate: number
  currentTransactionAmount: number
  monthlyFreeTier: number
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

  // Consider monthly free tier on the post-credit amount
  const newTotalVolumeAfterCredits =
    totalProcessedMonthToDate + amountAfterCredits

  if (monthlyFreeTier <= totalProcessedMonthToDate) {
    return `Credits applied: ${creditsPortionApplied}. Monthly free tier already exhausted. Full fee applied on post-credit amount ${amountAfterCredits}. Effective percentage on entire transaction: ${finalFlowgladFeePercentage.toPrecision(6)}%.`
  }

  if (newTotalVolumeAfterCredits <= monthlyFreeTier) {
    return `Credits applied: ${creditsPortionApplied}. No fee after credits due to monthly free tier. Processed MTD after post-credit amount: ${newTotalVolumeAfterCredits}. Free tier: ${monthlyFreeTier}.`
  }

  const freeTierOverageAfterCredits =
    newTotalVolumeAfterCredits - monthlyFreeTier
  return `Credits applied: ${creditsPortionApplied}. Partial fee after credits due to monthly free tier overage: ${freeTierOverageAfterCredits}. Processed MTD before post-credit amount: ${totalProcessedMonthToDate}. Free tier: ${monthlyFreeTier}. Effective percentage on entire transaction: ${finalFlowgladFeePercentage.toPrecision(6)}%.`
}

export const finalizeFeeCalculation = async (
  feeCalculation: FeeCalculation.Record,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const monthToDateResolvedPayments =
    await selectResolvedPaymentsMonthToDate(
      { organizationId: feeCalculation.organizationId },
      transaction
    )
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
  const totalProcessedMonthToDate =
    monthToDateResolvedPayments.reduce(
      (acc, payment) => acc + payment.amount,
      0
    )
  const totalProcessedLifetime = lifetimeResolvedPayments.reduce(
    (acc, payment) => acc + payment.amount,
    0
  )

  const organizationFeePercentage = parseFeePercentage(
    organization.feePercentage
  )
  const monthlyFreeTier = organization.monthlyBillingVolumeFreeTier
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

  // Step 2: Apply monthly free tier to the post-credit amount
  let chargeableAmount = 0
  if (amountAfterCredits > 0) {
    if (monthlyFreeTier <= totalProcessedMonthToDate) {
      chargeableAmount = amountAfterCredits
    } else {
      const freeTierRemaining =
        monthlyFreeTier - totalProcessedMonthToDate
      chargeableAmount = Math.max(
        amountAfterCredits - freeTierRemaining,
        0
      )
    }
  }

  const finalFlowgladFeePercentage =
    currentTransactionAmount > 0
      ? (organizationFeePercentage * chargeableAmount) /
        currentTransactionAmount
      : 0

  const internalNotes = generateFeeCalculationNotesWithCredits({
    totalProcessedMonthToDate,
    currentTransactionAmount,
    monthlyFreeTier,
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
