import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Country } from '@/db/schema/countries'
import type { Discount } from '@/db/schema/discounts'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import type {
  BillingAddress,
  Organization,
} from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { Purchase } from '@/db/schema/purchases'
import { selectCountryById } from '@/db/tableMethods/countryMethods'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import { insertFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import type { DbTransaction } from '@/db/types'
import {
  CheckoutSessionType,
  type CountryCode,
  type CurrencyCode,
  FeeCalculationType,
  type PaymentMethodType,
  StripeConnectContractType,
} from '@/types'
import {
  calculateDiscountAmount,
  calculateFlowgladFeePercentage,
  calculateInternationalFeePercentage,
  calculateInvoiceBaseAmount,
  calculateMoRSurchargePercentage,
  calculatePaymentMethodFeeAmount,
  calculatePriceBaseAmount,
  calculateTaxes,
} from './common'

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
  const morSurchargePct = calculateMoRSurchargePercentage({
    organization,
  })
  const intlPct = calculateInternationalFeePercentage({
    paymentMethod: paymentMethodType,
    paymentMethodCountry: billingAddress.address
      .country as CountryCode,
    organization,
    organizationCountry,
  })
  const pretax = Math.max(baseAmount - (discountAmount ?? 0), 0)
  const paymentFee = calculatePaymentMethodFeeAmount(
    pretax,
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
    flowgladFeePercentage: flowPct.toString(),
    morSurchargePercentage: morSurchargePct.toString(),
    discountAmountFixed: discountAmount,
    pretaxTotal: pretax,
    internationalFeePercentage: intlPct.toString(),
    paymentMethodFeeFixed: paymentFee,
    billingAddress,
    billingPeriodId: null,
    taxAmountFixed: 0,
  }
}

export const createCheckoutSessionFeeCalculationInsertForInvoice =
  async (params: {
    organization: Organization.Record
    invoice: Invoice.Record
    invoiceLineItems: InvoiceLineItem.ClientRecord[]
    billingAddress: BillingAddress
    paymentMethodType: PaymentMethodType
    checkoutSessionId: string
    organizationCountry: Country.Record
  }): Promise<FeeCalculation.Insert> => {
    const {
      organization,
      invoice,
      invoiceLineItems,
      billingAddress,
      paymentMethodType,
      checkoutSessionId,
      organizationCountry,
    } = params
    const base = calculateInvoiceBaseAmount({ invoiceLineItems })
    const insert = createBaseFeeCalculationInsert({
      organization,
      billingAddress,
      paymentMethodType,
      baseAmount: base,
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
    }
  }

export const createCheckoutSessionFeeCalculationInsertForPrice =
  async (params: {
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
  }): Promise<FeeCalculation.Insert> => {
    const {
      organization,
      product,
      price,
      purchase,
      discount,
      billingAddress,
      paymentMethodType,
      checkoutSessionId,
      organizationCountry,
      livemode,
    } = params
    const base = calculatePriceBaseAmount({ price, purchase })
    const discountAmt = calculateDiscountAmount(base, discount)
    const insert = createBaseFeeCalculationInsert({
      organization,
      billingAddress,
      paymentMethodType,
      baseAmount: base,
      discountAmount: discountAmt,
      currency: price.currency,
      livemode,
      checkoutSessionId,
      organizationCountry,
    })
    let taxFixed = 0,
      taxId = null,
      taxTxn = null
    if (
      organization.stripeConnectContractType ===
      StripeConnectContractType.MerchantOfRecord
    ) {
      const calc = await calculateTaxes({
        discountInclusiveAmount: Math.max(base - discountAmt, 0),
        product,
        billingAddress,
        price,
        purchase,
      })
      taxFixed = calc.taxAmountFixed
      taxId = calc.stripeTaxCalculationId
      taxTxn = calc.stripeTaxTransactionId
    }
    return {
      ...insert,
      taxAmountFixed: taxFixed,
      stripeTaxCalculationId: taxId,
      stripeTaxTransactionId: taxTxn,
      purchaseId: purchase?.id,
      priceId: price.id,
      discountId: discount?.id,
      billingPeriodId: null,
      livemode: price.livemode,
    }
  }

export const createInvoiceFeeCalculationForCheckoutSession = async (
  params: any,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const insert =
    await createCheckoutSessionFeeCalculationInsertForInvoice(params)
  return insertFeeCalculation(insert, transaction)
}

export const createCheckoutSessionFeeCalculation = async (
  params: any,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const insert =
    await createCheckoutSessionFeeCalculationInsertForPrice(params)
  return insertFeeCalculation(insert, transaction)
}

export const createFeeCalculationForCheckoutSession = async (
  checkoutSession: CheckoutSession.FeeReadyRecord,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const discount = checkoutSession.discountId
    ? await selectDiscountById(
        checkoutSession.discountId,
        transaction
      )
    : undefined
  if (checkoutSession.type === CheckoutSessionType.Invoice) {
    const organization = await selectOrganizationById(
      checkoutSession.organizationId,
      transaction
    )
    const organizationCountry = await selectCountryById(
      organization.countryId,
      transaction
    )
    const [{ invoice, invoiceLineItems }] =
      await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
        { id: checkoutSession.invoiceId },
        transaction
      )
    return createInvoiceFeeCalculationForCheckoutSession(
      {
        organization,
        organizationCountry,
        invoice,
        checkoutSessionId: checkoutSession.id,
        invoiceLineItems,
        billingAddress: checkoutSession.billingAddress,
        paymentMethodType: checkoutSession.paymentMethodType,
      },
      transaction
    )
  }

  const [{ price, product, organization }] =
    await selectPriceProductAndOrganizationByPriceWhere(
      { id: checkoutSession.priceId! },
      transaction
    )
  const organizationCountryId = organization.countryId
  if (!organizationCountryId) {
    throw new Error('Organization country id is required')
  }
  const organizationCountry = await selectCountryById(
    organizationCountryId,
    transaction
  )
  return createCheckoutSessionFeeCalculation(
    {
      organization,
      product,
      price,
      discount,
      checkoutSessionId: checkoutSession.id,
      billingAddress: checkoutSession.billingAddress,
      paymentMethodType: checkoutSession.paymentMethodType,
      organizationCountry,
    },
    transaction
  )
}
