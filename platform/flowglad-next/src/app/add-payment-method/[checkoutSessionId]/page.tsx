import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { CheckoutInfoCore } from '@/db/tableMethods/purchaseMethods'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import {
  CheckoutSessionStatus,
  CheckoutFlowType,
  CheckoutSessionType,
} from '@/types'
import core from '@/utils/core'
import { getClientSecretsForCheckoutSession } from '@/utils/checkoutHelpers'
import { notFound, redirect } from 'next/navigation'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import CheckoutForm from '@/components/CheckoutForm'
import CheckoutPageProvider from '@/contexts/checkoutPageContext'
import { LightThemeWrapper } from '@/components/LightThemeWrapper'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
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
  const { clientSecret, customerSessionClientSecret } =
    await getClientSecretsForCheckoutSession(
      checkoutSession,
      customer
    )
  if (!clientSecret) {
    throw new Error('No client secret found')
  }

  const checkoutInfo: CheckoutInfoCore = {
    checkoutSession,
    sellerOrganization,
    redirectUrl: core.safeUrl(
      `/purchase/post-payment`,
      core.NEXT_PUBLIC_APP_URL
    ),
    readonlyCustomerEmail: customer.email,
    feeCalculation: null,
    clientSecret,
    customerSessionClientSecret,
    flowType: CheckoutFlowType.AddPaymentMethod,
  }

  return (
    <LightThemeWrapper>
      <div className="w-full h-full min-h-screen">
        <div className="flex flex-col items-center justify-start min-h-screen pt-16 pb-8 gap-8 max-w-[380px] m-auto">
          <div className="flex flex-row items-center justify-between w-full relative">
            {checkoutSession.cancelUrl && (
              <Link
                href={checkoutSession.cancelUrl}
                className="absolute left-0"
              >
                <ChevronLeft className="w-6 h-6" />
              </Link>
            )}
            <div className="text-2xl font-bold flex-1 text-center">
              Add Payment Method
            </div>
            <div className="flex-0" />
          </div>
          <CheckoutPageProvider values={checkoutInfo}>
            <CheckoutForm />
          </CheckoutPageProvider>
        </div>
      </div>
    </LightThemeWrapper>
  )
}

export default CheckoutSessionPage
