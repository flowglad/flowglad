import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { BillingInfoCore } from '@/db/tableMethods/purchaseMethods'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import {
  CheckoutSessionStatus,
  CheckoutFlowType,
  CheckoutSessionType,
} from '@/types'
import core from '@/utils/core'
import { getPaymentIntent, getSetupIntent } from '@/utils/stripe'
import { notFound, redirect } from 'next/navigation'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import CheckoutForm from '@/components/CheckoutForm'
import CheckoutPageProvider from '@/contexts/checkoutPageContext'

const CheckoutSessionPage = async ({
  params,
}: {
  params: Promise<{ checkoutSessionId: string }>
}) => {
  const { checkoutSessionId } = await params
  const { checkoutSession, sellerOrganization, customer } =
    await adminTransaction(async ({ transaction }) => {
      const checkoutSession = await selectCheckoutSessionById(
        checkoutSessionId,
        transaction
      )
      if (
        checkoutSession.type !== CheckoutSessionType.AddPaymentMethod
      ) {
        notFound()
      }
      const customer = await selectCustomerById(
        checkoutSession.customerId,
        transaction
      )
      const organization = await selectOrganizationById(
        checkoutSession.organizationId,
        transaction
      )
      return {
        checkoutSession,
        sellerOrganization: organization,
        customer,
      }
    })

  if (!checkoutSession) {
    notFound()
  }

  if (checkoutSession.status !== CheckoutSessionStatus.Open) {
    redirect(
      `/purchase/post-payment?setup_intent=${checkoutSession.stripeSetupIntentId}`
    )
  }
  let clientSecret: string | null = null
  if (checkoutSession.stripePaymentIntentId) {
    const paymentIntent = await getPaymentIntent(
      checkoutSession.stripePaymentIntentId
    )
    clientSecret = paymentIntent.client_secret
  } else if (checkoutSession.stripeSetupIntentId) {
    const setupIntent = await getSetupIntent(
      checkoutSession.stripeSetupIntentId
    )
    clientSecret = setupIntent.client_secret
  } else {
    throw new Error('No client secret found')
  }

  const billingInfo: BillingInfoCore = {
    checkoutSession,
    sellerOrganization,
    redirectUrl: core.safeUrl(
      `/purchase/post-payment`,
      core.envVariable('NEXT_PUBLIC_APP_URL')
    ),
    readonlyCustomerEmail: customer.email,
    feeCalculation: null,
    clientSecret,
    flowType: CheckoutFlowType.AddPaymentMethod,
  }

  return (
    <CheckoutPageProvider values={billingInfo}>
      <CheckoutForm />
    </CheckoutPageProvider>
  )
}

export default CheckoutSessionPage
