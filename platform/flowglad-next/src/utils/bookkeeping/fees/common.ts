import { BillingAddress } from '@/db/schema/organizations'
import { Discount } from '@/db/schema/discounts'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Purchase } from '@/db/schema/purchases'
import { Price } from '@/db/schema/prices'
import {
  CountryCode,
  CurrencyCode,
  DiscountAmountType,
  PriceType,
  StripeConnectContractType,
  PaymentMethodType,
} from '@/types'
import { DbTransaction } from '@/db/types'
import Stripe from 'stripe'
import {
  createStripeTaxCalculationByPurchase,
  createStripeTaxCalculationByPrice,
} from '@/utils/stripe'
import { isNil, nanoid } from '@/utils/core'
import {
  insertFeeCalculation,
  updateFeeCalculation,
} from '@/db/tableMethods/feeCalculationMethods'
import { DiscountRedemption } from '@/db/schema/discountRedemptions'
import { Country } from '@/db/schema/countries'
import { selectResolvedPaymentsMonthToDate } from '@/db/tableMethods/paymentMethods'
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

export const calculatePercentageFee = (amount: number, percentage: number): number =>
  Math.round((amount * percentage) / 100)

export const validateNumericAmount = (amount: number, fieldName: string): void => {
  if (isNaN(amount)) {
    throw Error(`${fieldName} is NaN`)
  }
}

/* Base Amount Calculations */
export const calculateInvoiceBaseAmount = (
  invoice: { invoiceLineItems: { price: number; quantity: number }[] }
): number => {
  return invoice.invoiceLineItems.reduce((acc, item) => acc + item.price * item.quantity, 0)
}

export const calculatePriceBaseAmount = ({
  price,
  invoice,
  purchase,
}: {
  price: Price.ClientRecord
  invoice?: { invoiceLineItems: { price: number; quantity: number }[] } | null
  purchase?: Purchase.ClientRecord | null
}): number => {
  if (!purchase && !invoice) return price.unitPrice
  if (isNil(purchase?.firstInvoiceValue) && isNil(purchase?.pricePerBillingCycle))
    return price.unitPrice
  if (purchase.priceType === PriceType.SinglePayment && purchase.firstInvoiceValue)
    return purchase.firstInvoiceValue
  if (purchase.priceType === PriceType.Subscription && purchase.pricePerBillingCycle)
    return purchase.pricePerBillingCycle
  return price.unitPrice
}

/* Discount Calculations */
export const calculateDiscountAmount = (
  basePrice: number,
  discount?: Discount.ClientRecord | null
): number => {
  if (!discount) return 0
  if (discount.amountType === DiscountAmountType.Fixed) return discount.amount
  if (discount.amountType === DiscountAmountType.Percent)
    return calculatePercentageFee(basePrice, Math.min(discount.amount, 100))
  return 0
}

export const calculateDiscountAmountFromRedemption = (
  baseAmount: number,
  redemption?: DiscountRedemption.Record
): number => {
  if (!redemption) return 0
  if (redemption.discountAmountType === DiscountAmountType.Fixed)
    return redemption.discountAmount
  return calculatePercentageFee(baseAmount, Math.min(redemption.discountAmount, 100))
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
    organization.stripeConnectContractType === StripeConnectContractType.MerchantOfRecord &&
    paymentMethodCountry.toUpperCase() === 'US'
  ) {
    return 0
  }
  const orgCode = organizationCountry.code.toUpperCase()
  const payCode = paymentMethodCountry.toUpperCase()
  const valid = Object.values(CountryCode).map((c) => c.toUpperCase()).includes(payCode)
  if (!valid) {
    throw Error(`Billing address country ${payCode} is not in the list of country codes`)
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
        totalAmountToCharge * (CARD_BASE_FEE_PERCENTAGE / 100) + CARD_FIXED_FEE_CENTS
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
        totalAmountToCharge * (CARD_BASE_FEE_PERCENTAGE / 100) + CARD_FIXED_FEE_CENTS
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
    : await createStripeTaxCalculationByPrice({
        price,
        billingAddress,
        discountInclusiveAmount,
        product,
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
  validateNumericAmount(discountAmountFixed ?? 0, 'Discount amount fixed')
  validateNumericAmount(
    parseFloat(internationalFeePercentage),
    'International fee percentage'
  )
  const safeDiscount = discountAmountFixed ? Math.max(discountAmountFixed, 0) : 0
  const discountInclusiveAmount = baseAmount - safeDiscount
  const flowFixed = calculatePercentageFee(
    discountInclusiveAmount,
    parseFloat(flowgladFeePercentage!)
  )
  const intlFixed = calculatePercentageFee(
    discountInclusiveAmount,
    parseFloat(internationalFeePercentage!)
  )
  return Math.round(flowFixed + intlFixed + paymentMethodFeeFixed + taxAmountFixed)
}

export const calculateTotalDueAmount = (
  feeCalculation: FeeCalculation.CustomerRecord
): number =>
  Math.max(
    feeCalculation.baseAmount - (feeCalculation.discountAmountFixed ?? 0) +
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
  const newTotal = totalProcessedMonthToDate + currentTransactionAmount
  if (monthlyFreeTier <= totalProcessedMonthToDate)
    return `Full fee applied. Processed this month before transaction: ${totalProcessedMonthToDate}. Free tier: ${monthlyFreeTier}.`
  if (newTotal <= monthlyFreeTier)
    return `No fee applied. Processed this month after transaction: ${newTotal}. Free tier: ${monthlyFreeTier}.`
  const overage = newTotal - monthlyFreeTier
  return `Partial fee applied. Overage: ${overage}. Processed this month before transaction: ${totalProcessedMonthToDate}. Free tier: ${monthlyFreeTier}. Effective percentage: ${finalFlowgladFeePercentage.toPrecision(6)}%.`
}

export const finalizeFeeCalculation = async (
  feeCalculation: FeeCalculation.Record,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const payments = await selectResolvedPaymentsMonthToDate(
    { organizationId: feeCalculation.organizationId },
    transaction
  )
  const organization = await selectOrganizationById(
    feeCalculation.organizationId,
    transaction
  )
  const totalProcessed = payments.reduce((acc, p) => acc + p.amount, 0)
  const orgPct = parseFeePercentage(organization.feePercentage)
  const freeTier = organization.monthlyBillingVolumeFreeTier
  const currentAmt = feeCalculation.pretaxTotal ?? 0
  const newTotal = totalProcessed + currentAmt
  let finalPct: number
  if (freeTier <= totalProcessed) finalPct = orgPct
  else if (newTotal <= freeTier) finalPct = 0
  else {
    const overAmt = newTotal - freeTier
    const feeAmt = calculatePercentageFee(overAmt, orgPct)
    finalPct = currentAmt > 0 ? (feeAmt / currentAmt) * 100 : 0
  }
  const notes = generateFeeCalculationNotes(
    totalProcessed,
    currentAmt,
    freeTier,
    finalPct
  )
  const update: FeeCalculation.Update = {
    ...feeCalculation,
    flowgladFeePercentage: finalPct.toString(),
    internalNotes: `${notes} Calculated time: ${new Date().toISOString()}`,
  }
  return updateFeeCalculation(update, transaction)
}