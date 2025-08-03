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
  FeeCalculationType,
  PaymentMethodType,
  PriceType,
  StripeConnectContractType,
  SubscriptionItemType,
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
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { DiscountRedemption } from '@/db/schema/discountRedemptions'
import { Country } from '@/db/schema/countries'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { selectResolvedPaymentsMonthToDate } from '@/db/tableMethods/paymentMethods'
import {
  ClientInvoiceWithLineItems,
  InvoiceLineItem,
  invoiceLineItems,
  InvoiceWithLineItems,
} from '@/db/schema/invoiceLineItems'
import { selectDiscountRedemptions } from '@/db/tableMethods/discountRedemptionMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { Invoice } from '@/db/schema/invoices'
import { CheckoutSession } from '@/db/schema/checkoutSessions'

/* Constants */
const CARD_CROSS_BORDER_FEE_PERCENTAGE = 1.5
const CARD_BASE_FEE_PERCENTAGE = 2.9
const CARD_FIXED_FEE_CENTS = 30
const BANK_ACCOUNT_FEE_PERCENTAGE = 0.8
const BANK_ACCOUNT_MAX_FEE_CENTS = 500
const SEPA_DEBIT_FEE_PERCENTAGE = 0.8
const SEPA_DEBIT_MAX_FEE_CENTS = 600

/* Helper Functions */
const parseFeePercentage = (feePercentage: string): number => 
  parseFloat(feePercentage)

const calculatePercentageFee = (amount: number, percentage: number): number =>
  Math.round((amount * percentage) / 100)

const validateNumericAmount = (amount: number, fieldName: string): void => {
  if (isNaN(amount)) {
    throw Error(`${fieldName} is NaN`)
  }
}

/* Base Amount Calculations */
export const calculateInvoiceBaseAmount = (
  invoice: ClientInvoiceWithLineItems
): number => {
  return invoice.invoiceLineItems.reduce((acc, item) => {
    return acc + item.price * item.quantity
  }, 0)
}

export const calculatePriceBaseAmount = ({
  price,
  invoice,
  purchase,
}: {
  price: Price.ClientRecord
  invoice?: InvoiceWithLineItems | null
  purchase?: Purchase.ClientRecord | null
}): number => {
  if (!purchase && !invoice) {
    return price.unitPrice
  }

  if (isNil(purchase?.firstInvoiceValue) && isNil(purchase?.pricePerBillingCycle)) {
    return price.unitPrice
  }

  if (purchase.priceType === PriceType.SinglePayment && purchase.firstInvoiceValue) {
    return purchase.firstInvoiceValue
  }

  if (purchase.priceType === PriceType.Subscription && purchase.pricePerBillingCycle) {
    return purchase.pricePerBillingCycle
  }

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
    return calculatePercentageFee(basePrice, Math.min(discount.amount, 100))
  }

  return 0
}

export const calculateDiscountAmountFromRedemption = (
  baseAmount: number,
  redemption?: DiscountRedemption.Record
): number => {
  if (!redemption) {
    return 0
  }

  if (redemption.discountAmountType === DiscountAmountType.Fixed) {
    return redemption.discountAmount
  }

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
  // Always charge 0 for Merchant of Record transactions with US billing addresses
  if (
    organization.stripeConnectContractType === StripeConnectContractType.MerchantOfRecord &&
    paymentMethodCountry.toUpperCase() === 'US'
  ) {
    return 0
  }

  const organizationCountryCode = organizationCountry.code.toUpperCase()
  const billingAddressCountryCode = paymentMethodCountry.toUpperCase()
  
  const billingAddressCountryInCountryCodes = Object.values(CountryCode)
    .map((country) => country.toUpperCase())
    .some((country) => country === billingAddressCountryCode)

  if (!billingAddressCountryInCountryCodes) {
    throw Error(`Billing address country ${billingAddressCountryCode} is not in the list of country codes`)
  }

  if (organizationCountryCode === billingAddressCountryCode) {
    return 0
  }
  
  // Cards incur a cross border fee of 1.5%.
  // Other foreign exchange fees are calculated during the payout step, rather than the pay-in step.
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
  if (totalAmountToCharge <= 0) {
    return 0
  }

  switch (paymentMethod) {
    case PaymentMethodType.Card:
    case PaymentMethodType.Link:
      return Math.round(totalAmountToCharge * (CARD_BASE_FEE_PERCENTAGE / 100) + CARD_FIXED_FEE_CENTS)
    case PaymentMethodType.USBankAccount:
      return Math.round(Math.min(
        totalAmountToCharge * (BANK_ACCOUNT_FEE_PERCENTAGE / 100),
        BANK_ACCOUNT_MAX_FEE_CENTS
      ))
    case PaymentMethodType.SEPADebit:
      return Math.round(Math.min(
        totalAmountToCharge * (SEPA_DEBIT_FEE_PERCENTAGE / 100),
        SEPA_DEBIT_MAX_FEE_CENTS
      ))
    default:
      // Default: assume the old 2.9% + .30.
      // If it later turns out that the stripe processing fee is a different rate,
      // we can always retroactively refund the difference.
      return Math.round(totalAmountToCharge * (CARD_BASE_FEE_PERCENTAGE / 100) + CARD_FIXED_FEE_CENTS)
  }
}

/* Tax Calculations */
interface TaxCalculationResult {
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

  const taxCalculation = purchase
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
    taxAmountFixed: taxCalculation.tax_amount_exclusive,
    stripeTaxCalculationId: taxCalculation.id!,
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
  validateNumericAmount(parseFloat(internationalFeePercentage), 'International fee percentage')

  const safeDiscountAmount = discountAmountFixed ? Math.max(discountAmountFixed, 0) : 0
  const discountInclusiveAmount = baseAmount - safeDiscountAmount

  const flowgladFeeFixed = calculatePercentageFee(
    discountInclusiveAmount,
    parseFloat(flowgladFeePercentage!)
  )

  const internationalFeeFixed = calculatePercentageFee(
    discountInclusiveAmount,
    parseFloat(internationalFeePercentage!)
  )

  return Math.round(
    flowgladFeeFixed +
    internationalFeeFixed +
    paymentMethodFeeFixed +
    taxAmountFixed
  )
}

export const calculateTotalDueAmount = (
  feeCalculation: FeeCalculation.CustomerRecord
): number => {
  const { baseAmount, discountAmountFixed, taxAmountFixed } = feeCalculation
  return Math.max(
    baseAmount - (discountAmountFixed ?? 0) + taxAmountFixed,
    0
  )
}

/* Fee Calculation Insert Builders */
interface CheckoutSessionFeeCalculationParams {
  organization: Organization.Record
  product: Product.Record
  price: Price.Record
  purchase?: Purchase.Record
  discount?: Discount.Record
  billingAddress: BillingAddress
  paymentMethodType: PaymentMethodType
  checkoutSessionId: string
  organizationCountry: Country.Record
}

interface InvoiceFeeCalculationParams extends Omit<CheckoutSessionFeeCalculationParams, 'price' | 'product' | 'purchase' | 'discount'> {
  invoice: Invoice.ClientRecord
  invoiceLineItems: InvoiceLineItem.ClientRecord[]
}

const createBaseFeeCalculationInsert = ({
  organization,
  billingAddress,
  paymentMethodType,
  baseAmount,
  discountAmount = 0,
  currency,
  livemode,
  checkoutSessionId,
  organizationCountry,
}: {
  organization: Organization.Record
  billingAddress: BillingAddress
  paymentMethodType: PaymentMethodType
  baseAmount: number
  discountAmount?: number
  currency: CurrencyCode
  livemode: boolean
  checkoutSessionId: string
  organizationCountry: Country.Record
}): FeeCalculation.CheckoutSessionInsert => {
  const flowgladFeePercentage = calculateFlowgladFeePercentage({ organization })
  const internationalFeePercentage = calculateInternationalFeePercentage({
    paymentMethod: paymentMethodType,
    paymentMethodCountry: billingAddress.address.country as CountryCode,
    organization,
    organizationCountry,
  })

  const discountInclusiveAmount = Math.max(baseAmount - (discountAmount ?? 0), 0)
  const paymentMethodFeeFixed = calculatePaymentMethodFeeAmount(
    discountInclusiveAmount,
    paymentMethodType
  )

  return {
    type: FeeCalculationType.CheckoutSessionPayment,
    checkoutSessionId,
    currency,
    livemode,
    organizationId: organization.id,
    paymentMethodType,
    baseAmount,
    flowgladFeePercentage: flowgladFeePercentage.toString(),
    discountAmountFixed: discountAmount,
    pretaxTotal: discountInclusiveAmount,
    internationalFeePercentage: internationalFeePercentage.toString(),
    paymentMethodFeeFixed,
    billingAddress,
    billingPeriodId: null,
    taxAmountFixed: 0,
  }
}

export const createCheckoutSessionFeeCalculationInsertForInvoice = async (
  params: InvoiceFeeCalculationParams
): Promise<FeeCalculation.Insert> => {
  const { organization, invoice, checkoutSessionId, invoiceLineItems, billingAddress, paymentMethodType, organizationCountry } = params
  
  const baseAmount = calculateInvoiceBaseAmount({
    invoice,
    invoiceLineItems,
  })

  const insert = createBaseFeeCalculationInsert({
    organization,
    billingAddress,
    paymentMethodType,
    baseAmount,
    currency: invoice.currency,
    livemode: invoice.livemode,
    checkoutSessionId,
    organizationCountry,
  })

  return {
    ...insert,
    priceId: null,
    discountId: null,
    billingPeriodId: null,
    taxAmountFixed: 0,
    stripeTaxCalculationId: null,
    stripeTaxTransactionId: null,
    purchaseId: null,
    internalNotes: 'Invoice fee calculation',
  } as FeeCalculation.Insert
}

export const createCheckoutSessionFeeCalculationInsertForPrice = async ({
  organization,
  product,
  price,
  purchase,
  discount,
  billingAddress,
  paymentMethodType,
  organizationCountry,
  checkoutSessionId,
}: CheckoutSessionFeeCalculationParams): Promise<FeeCalculation.Insert> => {
  const baseAmount = calculatePriceBaseAmount({ price, purchase })
  const discountAmount = calculateDiscountAmount(baseAmount, discount)
  const discountInclusiveAmount = Math.max(baseAmount - (discountAmount ?? 0), 0)

  const insert = createBaseFeeCalculationInsert({
    organization,
    billingAddress,
    paymentMethodType,
    baseAmount,
    discountAmount,
    currency: price.currency,
    livemode: price.livemode,
    checkoutSessionId,
    organizationCountry,
  })

  let taxAmountFixed = 0
  let stripeTaxCalculationId = null
  let stripeTaxTransactionId = null

  if (organization.stripeConnectContractType === StripeConnectContractType.MerchantOfRecord) {
    const taxCalculation = await calculateTaxes({
      discountInclusiveAmount,
      product,
      billingAddress,
      price,
      purchase,
    })
    taxAmountFixed = taxCalculation.taxAmountFixed
    stripeTaxCalculationId = taxCalculation.stripeTaxCalculationId
    stripeTaxTransactionId = taxCalculation.stripeTaxTransactionId
  }

  return {
    ...insert,
    taxAmountFixed,
    stripeTaxCalculationId,
    stripeTaxTransactionId,
    purchaseId: purchase?.id,
    priceId: price.id,
    discountId: discount?.id,
    billingPeriodId: null,
    livemode: price.livemode,
  }
}

/* Fee Calculation Creation and Finalization */
export const createInvoiceFeeCalculationForCheckoutSession = async (
  params: InvoiceFeeCalculationParams,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const insert = await createCheckoutSessionFeeCalculationInsertForInvoice(params)
  return insertFeeCalculation(insert, transaction)
}

export const createCheckoutSessionFeeCalculation = async (
  params: CheckoutSessionFeeCalculationParams,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const feeCalculationInsert = await createCheckoutSessionFeeCalculationInsertForPrice(params)
  return insertFeeCalculation(feeCalculationInsert, transaction)
}

const generateFeeCalculationNotes = (
  totalProcessedMonthToDate: number,
  currentTransactionAmount: number,
  monthlyFreeTier: number,
  finalFlowgladFeePercentage: number
): string => {
  const newTotalVolume = totalProcessedMonthToDate + currentTransactionAmount

  if (monthlyFreeTier <= totalProcessedMonthToDate) {
    return `Full fee applied. Processed this month before transaction: ${totalProcessedMonthToDate}. Free tier: ${monthlyFreeTier}.`
  }

  if (newTotalVolume <= monthlyFreeTier) {
    return `No fee applied. Processed this month after transaction: ${newTotalVolume}. Free tier: ${monthlyFreeTier}.`
  }

  const overageAmount = newTotalVolume - monthlyFreeTier
  return `Partial fee applied. Overage: ${overageAmount}. Processed this month before transaction: ${totalProcessedMonthToDate}. Free tier: ${monthlyFreeTier}. Effective percentage: ${finalFlowgladFeePercentage.toPrecision(6)}%.`
}

export const finalizeFeeCalculation = async (
  feeCalculation: FeeCalculation.Record,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const monthToDateResolvedPayments = await selectResolvedPaymentsMonthToDate(
    { organizationId: feeCalculation.organizationId },
    transaction
  )

  const organization = await selectOrganizationById(
    feeCalculation.organizationId,
    transaction
  )

  // Hard assume that the payments are processed in pennies.
  // We accept imprecision for Euros, and for other currencies.
  const totalProcessedMonthToDate = monthToDateResolvedPayments.reduce(
    (acc, payment) => acc + payment.amount,
    0
  )

  const organizationFeePercentage = parseFeePercentage(organization.feePercentage)
  const monthlyFreeTier = organization.monthlyBillingVolumeFreeTier
  const currentTransactionAmount = feeCalculation.pretaxTotal ?? 0
  const newTotalVolume = totalProcessedMonthToDate + currentTransactionAmount

  let finalFlowgladFeePercentage: number
  if (monthlyFreeTier <= totalProcessedMonthToDate) {
    // Already over the free tier, charge full fee on the current transaction
    finalFlowgladFeePercentage = organizationFeePercentage
  } else if (newTotalVolume <= monthlyFreeTier) {
    // Still within the free tier after this transaction, no fee
    finalFlowgladFeePercentage = 0
  } else {
    // Transaction crosses the free tier boundary. Only charge for the overage.
    const overageAmount = newTotalVolume - monthlyFreeTier
    const feeAmount = calculatePercentageFee(overageAmount, organizationFeePercentage)
    finalFlowgladFeePercentage = currentTransactionAmount > 0
      ? (feeAmount / currentTransactionAmount) * 100
      : 0
  }

  const internalNotes = generateFeeCalculationNotes(
    totalProcessedMonthToDate,
    currentTransactionAmount,
    monthlyFreeTier,
    finalFlowgladFeePercentage
  )

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

/* Subscription Fee Calculations */
export interface SubscriptionFeeCalculationParams {
  organization: Organization.Record
  billingPeriod: BillingPeriod.Record
  billingPeriodItems: BillingPeriodItem.Record[]
  paymentMethod: PaymentMethod.Record
  discountRedemption?: DiscountRedemption.Record
  organizationCountry: Country.Record
  livemode: boolean
  currency: CurrencyCode
  usageOverages: { usageMeterId: string; balance: number }[]
}

export const calculateBillingItemBaseAmount = (
  billingPeriodItems: BillingPeriodItem.Record[],
  usageOverages: { usageMeterId: string; balance: number }[]
): number => {
  const staticBaseAmount = billingPeriodItems
    .filter((item) => item.type === SubscriptionItemType.Static)
    .reduce((acc, item) => acc + item.unitPrice * item.quantity, 0)

  const usageBillingPeriodItemsByUsageMeterId = new Map<
    string,
    BillingPeriodItem.UsageRecord
  >(billingPeriodItems
    .filter((item) => item.type === SubscriptionItemType.Usage)
    .map((item) => [item.usageMeterId!, item as BillingPeriodItem.UsageRecord]))

  const usageBaseAmount = usageOverages
    .map(({ usageMeterId, balance }) => {
      const usageItem = usageBillingPeriodItemsByUsageMeterId.get(usageMeterId)
      if (!usageItem) {
        throw new Error(
          `Usage billing period item not found for usage meter id: ${usageMeterId}`
        )
      }
      return (balance / usageItem.usageEventsPerUnit) * usageItem.unitPrice
    })
    .reduce((acc, cost) => acc + cost, 0)

  return staticBaseAmount + usageBaseAmount
}

export const createSubscriptionFeeCalculationInsert = (
  params: SubscriptionFeeCalculationParams
): FeeCalculation.Insert => {
  const {
    organization,
    billingPeriod,
    billingPeriodItems,
    paymentMethod,
    discountRedemption,
    organizationCountry,
    livemode,
    currency,
    usageOverages,
  } = params

  const baseAmount = calculateBillingItemBaseAmount(
    billingPeriodItems,
    usageOverages
  )
  const discountAmount = calculateDiscountAmountFromRedemption(
    baseAmount,
    discountRedemption
  )
  const discountInclusiveAmount = Math.max(baseAmount - (discountAmount ?? 0), 0)
  const flowgladFeePercentage = calculateFlowgladFeePercentage({ organization })
  const internationalFeePercentage = calculateInternationalFeePercentage({
    paymentMethod: paymentMethod.type,
    paymentMethodCountry:
      (paymentMethod.billingDetails.address?.country ??
      paymentMethod.paymentMethodData?.country) as CountryCode,
    organization,
    organizationCountry,
  })
  const paymentMethodFeeFixed = calculatePaymentMethodFeeAmount(
    discountInclusiveAmount,
    paymentMethod.type
  )

  let taxAmountFixed = 0
  let stripeTaxCalculationId: string | null = null
  let stripeTaxTransactionId: string | null = null
  if (
    organization.stripeConnectContractType ===
    StripeConnectContractType.MerchantOfRecord
  ) {
    // Subscription tax calculation currently no-op
  }

  return {
    type: FeeCalculationType.SubscriptionPayment,
    organizationId: organization.id,
    billingAddress: paymentMethod.billingDetails,
    priceId: null,
    checkoutSessionId: null,
    paymentMethodType: paymentMethod.type,
    discountAmountFixed: discountAmount,
    pretaxTotal: discountInclusiveAmount,
    billingPeriodId: billingPeriod.id,
    baseAmount,
    currency,
    flowgladFeePercentage: flowgladFeePercentage.toString(),
    internationalFeePercentage: internationalFeePercentage.toString(),
    paymentMethodFeeFixed,
    taxAmountFixed,
    stripeTaxCalculationId,
    stripeTaxTransactionId,
    livemode,
  }
}

export const createAndFinalizeSubscriptionFeeCalculation = async (
  params: SubscriptionFeeCalculationParams,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const [redemption] = await selectDiscountRedemptions(
    { subscriptionId: params.billingPeriod.subscriptionId, fullyRedeemed: false },
    transaction
  )
  const insert = createSubscriptionFeeCalculationInsert({
    ...params,
    discountRedemption: redemption,
  })
  const initial = await insertFeeCalculation(insert, transaction)
  return finalizeFeeCalculation(initial, transaction)
}
