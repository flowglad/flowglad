import CheckoutPage from '@/components/CheckoutPage'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { billingInfoSchema } from '@/db/tableMethods/purchaseMethods'
import {
  selectPriceProductAndOrganizationByPriceWhere,
  selectPricesAndProductByProductId,
} from '@/db/tableMethods/priceMethods'
import {
  CheckoutFlowType,
  PriceType,
  CheckoutSessionType,
} from '@/types'
import core from '@/utils/core'
import { findOrCreateCheckoutSession } from '@/utils/checkoutSessionState'
import { getPaymentIntent, getSetupIntent } from '@/utils/stripe'
import { Price } from '@/db/schema/prices'
import { notFound } from 'next/navigation'

interface PurchasePageProps {
  params: Promise<{
    priceId: string
  }>
}

const PurchasePage = async ({ params }: PurchasePageProps) => {
  if (core.IS_PROD) {
    return notFound()
  }
  const { priceId } = await params
  const {
    product,
    price,
    organization,
    checkoutSession,
    discount,
    feeCalculation,
    maybeCustomer,
  } = await adminTransaction(async ({ transaction }) => {
    const [{ product, price }] =
      await selectPriceProductAndOrganizationByPriceWhere(
        {
          id: priceId,
        },
        transaction
      )
    if (!product.active) {
      // TODO: ERROR PAGE UI
      return {
        product,
        price,
      }
    }
    const organization = await selectOrganizationById(
      product.organizationId,
      transaction
    )

    const checkoutSession = await findOrCreateCheckoutSession(
      {
        productId: product.id,
        price,
        organizationId: organization.id,
        type: CheckoutSessionType.Product,
      },
      transaction
    )

    const discount = checkoutSession.discountId
      ? await selectDiscountById(
          checkoutSession.discountId,
          transaction
        )
      : null

    const feeCalculation = await selectLatestFeeCalculation(
      {
        checkoutSessionId: checkoutSession.id,
        priceId: price.id,
      },
      transaction
    )

    const maybeCustomer = checkoutSession.customerId
      ? await selectCustomerById(
          checkoutSession.customerId,
          transaction
        )
      : null

    return {
      product,
      price,
      organization,
      checkoutSession,
      discount,
      feeCalculation,
      maybeCustomer,
    }
  })

  return (
    <>
      <div>
        <h1>{product.name}</h1>
        <p>{price.name}</p>
      </div>
    </>
  )
}

export default PurchasePage
