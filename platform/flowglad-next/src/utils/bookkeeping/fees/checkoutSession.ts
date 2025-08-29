import { BillingAddress } from '@/db/schema/organizations'
import { Discount } from '@/db/schema/discounts'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { Purchase } from '@/db/schema/purchases'
import { DbTransaction } from '@/db/types'
import { insertFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { calculateInvoiceBaseAmount, calculatePriceBaseAmount, calculateDiscountAmount, calculateFlowgladFeePercentage, calculateInternationalFeePercentage, calculatePaymentMethodFeeAmount, calculateTaxes } from './common'
import { CountryCode, CurrencyCode, FeeCalculationType, PaymentMethodType, StripeConnectContractType} from '@/types'
import { Country } from '@/db/schema/countries'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { Invoice } from '@/db/schema/invoices'

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
  const flowPct = calculateFlowgladFeePercentage({ organization })
  const intlPct = calculateInternationalFeePercentage({
    paymentMethod: paymentMethodType,
    paymentMethodCountry: billingAddress.address.country as CountryCode,
    organization,
    organizationCountry,
  })
  const pretax = Math.max(baseAmount - (discountAmount ?? 0), 0)
  const paymentFee = calculatePaymentMethodFeeAmount(pretax, paymentMethodType)

  return {
    type: FeeCalculationType.CheckoutSessionPayment,
    checkoutSessionId,
    currency,
    livemode,
    organizationId: organization.id,
    paymentMethodType,
    baseAmount,
    flowgladFeePercentage: flowPct.toString(),
    discountAmountFixed: discountAmount,
    pretaxTotal: pretax,
    internationalFeePercentage: intlPct.toString(),
    paymentMethodFeeFixed: paymentFee,
    billingAddress,
    billingPeriodId: null,
    taxAmountFixed: 0,
  }
}

export const createCheckoutSessionFeeCalculationInsertForInvoice = async (
  params: {
    organization: Organization.Record
    invoice: Invoice.Record
    invoiceLineItems: InvoiceLineItem.ClientRecord[]
    billingAddress: BillingAddress
    paymentMethodType: PaymentMethodType
    checkoutSessionId: string
    organizationCountry: Country.Record
  }
): Promise<FeeCalculation.Insert> => {
  const { organization, invoice, invoiceLineItems, billingAddress, paymentMethodType, checkoutSessionId, organizationCountry, } = params
  const base = calculateInvoiceBaseAmount({ invoiceLineItems })
  const insert = createBaseFeeCalculationInsert({ organization, billingAddress, paymentMethodType, baseAmount: base, currency: invoice.currency, livemode: invoice.livemode, checkoutSessionId, organizationCountry })
  return { ...insert, priceId: null, discountId: null, billingPeriodId: null, taxAmountFixed: 0, stripeTaxCalculationId: null, stripeTaxTransactionId: null, purchaseId: null }
}

export const createCheckoutSessionFeeCalculationInsertForPrice = async (
  params: {
    organization: Organization.Record
    product: Product.Record
    price: Price.Record
    purchase?: Purchase.Record
    discount?: Discount.ClientRecord
    billingAddress: BillingAddress
    paymentMethodType: PaymentMethodType
    checkoutSessionId: string
    organizationCountry: Country.Record
    livemode: boolean
  }
): Promise<FeeCalculation.Insert> => {
  const { organization, product, price, purchase, discount, billingAddress, paymentMethodType, checkoutSessionId, organizationCountry, livemode } = params
  const base = calculatePriceBaseAmount({ price, purchase })
  const discountAmt = calculateDiscountAmount(base, discount)
  const insert = createBaseFeeCalculationInsert({ organization, billingAddress, paymentMethodType, baseAmount: base, discountAmount: discountAmt, currency: price.currency, livemode, checkoutSessionId, organizationCountry })
  let taxFixed = 0, taxId = null, taxTxn = null
  if (organization.stripeConnectContractType === StripeConnectContractType.MerchantOfRecord) {
    const calc = await calculateTaxes({ discountInclusiveAmount: Math.max(base - discountAmt, 0), product, billingAddress, price, purchase })
    taxFixed = calc.taxAmountFixed; taxId = calc.stripeTaxCalculationId; taxTxn = calc.stripeTaxTransactionId
  }
  return { ...insert, taxAmountFixed: taxFixed, stripeTaxCalculationId: taxId, stripeTaxTransactionId: taxTxn, purchaseId: purchase?.id, priceId: price.id, discountId: discount?.id, billingPeriodId: null, livemode: price.livemode }
}

export const createInvoiceFeeCalculationForCheckoutSession = async (
  params: any,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const insert = await createCheckoutSessionFeeCalculationInsertForInvoice(params)
  return insertFeeCalculation(insert, transaction)
}

export const createCheckoutSessionFeeCalculation = async (
  params: any,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const insert = await createCheckoutSessionFeeCalculationInsertForPrice(params)
  return insertFeeCalculation(insert, transaction)
}