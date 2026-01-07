import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Country } from '@/db/schema/countries'
import type { DiscountRedemption } from '@/db/schema/discountRedemptions'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import { selectDiscountRedemptions } from '@/db/tableMethods/discountRedemptionMethods'
import { insertFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'
import {
  type CountryCode,
  type CurrencyCode,
  FeeCalculationType,
  StripeConnectContractType,
  SubscriptionItemType,
  type UsageBillingInfo,
} from '@/types'
import {
  calculateDiscountAmountFromRedemption,
  calculateFlowgladFeePercentage,
  calculateInternationalFeePercentage,
  calculateMoRSurchargePercentage,
  calculatePaymentMethodFeeAmount,
  calculateTaxes,
  finalizeFeeCalculation,
} from './common'

export interface SubscriptionFeeCalculationParams {
  organization: Organization.Record
  billingPeriod: BillingPeriod.Record
  billingPeriodItems: BillingPeriodItem.Record[]
  paymentMethod: PaymentMethod.Record
  discountRedemption?: DiscountRedemption.Record
  organizationCountry: Country.Record
  livemode: boolean
  currency: CurrencyCode
  usageOverages: Pick<
    UsageBillingInfo,
    | 'usageMeterId'
    | 'balance'
    | 'priceId'
    | 'usageEventsPerUnit'
    | 'unitPrice'
  >[]
}

export const calculateBillingItemBaseAmount = (
  items: BillingPeriodItem.Record[],
  overages: Pick<
    UsageBillingInfo,
    | 'usageMeterId'
    | 'balance'
    | 'priceId'
    | 'usageEventsPerUnit'
    | 'unitPrice'
  >[]
): number => {
  const staticAmt = items
    .filter((i) => i.type === SubscriptionItemType.Static)
    .reduce((acc, i) => acc + i.unitPrice * i.quantity, 0)
  const usageAmt = overages
    .map(({ balance, usageEventsPerUnit, unitPrice }) => {
      return (balance / usageEventsPerUnit) * unitPrice
    })
    .reduce((acc, v) => acc + v, 0)

  return staticAmt + usageAmt
}

export const createSubscriptionFeeCalculationInsert = async (
  params: SubscriptionFeeCalculationParams & {
    price: Price.Record
    product: Product.Record
  }
): Promise<FeeCalculation.Insert> => {
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
    price,
    product,
  } = params
  const baseAmt = calculateBillingItemBaseAmount(
    billingPeriodItems,
    usageOverages
  )
  const discountAmt = calculateDiscountAmountFromRedemption(
    baseAmt,
    discountRedemption
  )
  const pretax = Math.max(baseAmt - (discountAmt ?? 0), 0)
  const flowPct = calculateFlowgladFeePercentage({ organization })
  const morSurchargePct = calculateMoRSurchargePercentage({
    organization,
  })
  const intlPct = calculateInternationalFeePercentage({
    paymentMethod: paymentMethod.type,
    paymentMethodCountry: (paymentMethod.billingDetails.address
      ?.country ??
      paymentMethod.paymentMethodData?.country) as CountryCode,
    organization,
    organizationCountry,
  })
  const payFee = calculatePaymentMethodFeeAmount(
    pretax,
    paymentMethod.type
  )
  let taxFixed = 0
  let taxId: string | null = null
  let taxTxn: string | null = null
  if (
    organization.stripeConnectContractType ===
    StripeConnectContractType.MerchantOfRecord
  ) {
    const calc = await calculateTaxes({
      discountInclusiveAmount: pretax,
      product,
      billingAddress: paymentMethod.billingDetails,
      price,
    })
    taxFixed = calc.taxAmountFixed
    taxId = calc.stripeTaxCalculationId
    taxTxn = calc.stripeTaxTransactionId
  }
  return {
    type: FeeCalculationType.SubscriptionPayment,
    organizationId: organization.id,
    billingAddress: paymentMethod.billingDetails,
    priceId: null,
    checkoutSessionId: null,
    paymentMethodType: paymentMethod.type,
    discountAmountFixed: discountAmt,
    pretaxTotal: pretax,
    billingPeriodId: billingPeriod.id,
    baseAmount: baseAmt,
    currency,
    flowgladFeePercentage: flowPct.toString(),
    morSurchargePercentage: morSurchargePct.toString(),
    internationalFeePercentage: intlPct.toString(),
    paymentMethodFeeFixed: payFee,
    taxAmountFixed: taxFixed,
    stripeTaxCalculationId: taxId,
    stripeTaxTransactionId: taxTxn,
    livemode,
  }
}

export const createAndFinalizeSubscriptionFeeCalculation = async (
  params: SubscriptionFeeCalculationParams,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const [redemption] = await selectDiscountRedemptions(
    {
      subscriptionId: params.billingPeriod.subscriptionId,
      fullyRedeemed: false,
    },
    transaction
  )
  const subscription = await selectSubscriptionById(
    params.billingPeriod.subscriptionId,
    transaction
  )
  const price = await selectPriceById(
    subscription.priceId,
    transaction
  )
  // FIXME: PR 3 - Product lookup only applies to non-usage prices.
  // Usage prices don't have productId. For now, throw an error if this is called
  // for a usage price since we don't have a product to associate with fee calculation.
  if (!Price.hasProductId(price)) {
    throw new Error(
      `Cannot create fee calculation for usage price ${price.id} - usage prices don't have a product`
    )
  }
  const product = await selectProductById(
    price.productId,
    transaction
  )
  const insert = await createSubscriptionFeeCalculationInsert({
    ...params,
    discountRedemption: redemption,
    price,
    product,
  })
  const initial = await insertFeeCalculation(insert, transaction)
  return finalizeFeeCalculation(initial, transaction)
}
