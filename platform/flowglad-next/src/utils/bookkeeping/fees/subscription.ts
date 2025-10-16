import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { DiscountRedemption } from '@/db/schema/discountRedemptions'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { selectDiscountRedemptions } from '@/db/tableMethods/discountRedemptionMethods'
import { insertFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import {
  finalizeFeeCalculation,
  calculateDiscountAmountFromRedemption,
  calculateFlowgladFeePercentage,
  calculateInternationalFeePercentage,
  calculatePaymentMethodFeeAmount,
} from './common'
import {
  CurrencyCode,
  FeeCalculationType,
  SubscriptionItemType,
  CountryCode,
} from '@/types'
import { Country } from '@/db/schema/countries'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { DbTransaction } from '@/db/types'

export interface SubscriptionFeeCalculationParams {
  organization: any
  billingPeriod: any
  billingPeriodItems: BillingPeriodItem.Record[]
  paymentMethod: PaymentMethod.Record
  discountRedemption?: DiscountRedemption.Record
  organizationCountry: Country.Record
  livemode: boolean
  currency: CurrencyCode
  usageOverages: {
    usageMeterId: string
    balance: number
    priceId: string
    usageEventsPerUnit: number
    unitPrice: number
  }[]
}

export const calculateBillingItemBaseAmount = (
  items: BillingPeriodItem.Record[],
  overages: {
    usageMeterId: string
    balance: number
    priceId: string
    usageEventsPerUnit: number
    unitPrice: number
  }[]
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
    internationalFeePercentage: intlPct.toString(),
    paymentMethodFeeFixed: payFee,
    taxAmountFixed: 0,
    stripeTaxCalculationId: null,
    stripeTaxTransactionId: null,
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
  const insert = createSubscriptionFeeCalculationInsert({
    ...params,
    discountRedemption: redemption,
  })
  const initial = await insertFeeCalculation(insert, transaction)
  return finalizeFeeCalculation(initial, transaction)
}
