'use client'
import {
  LinkAuthenticationElement,
  PaymentElement,
  useElements,
  useStripe,
  AddressElement,
  LinkAuthenticationElementProps,
} from '@stripe/react-stripe-js'
import { FormEvent, useState } from 'react'
import core, { cn } from '@/utils/core'
import Button from '@/components/ion/Button'
import { trpc } from '@/app/_trpc/client'
import { Skeleton } from '@/components/ion/Skeleton'
import { useRouter } from 'next/navigation'
import {
  CheckoutFlowType,
  CurrencyCode,
  PaymentMethodType,
  PriceType,
} from '@/types'
import { LoaderCircle } from 'lucide-react'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import TotalBillingDetails from './ion/TotalBillingDetails'
import PoweredByFlowgladText from './ion/PoweredByFlowgladText'
import DiscountCodeInput from './DiscountCodeInput'
import {
  SubscriptionCheckoutDetails,
  useCheckoutPageContext,
} from '@/contexts/checkoutPageContext'
import { calculateTotalDueAmount } from '@/utils/bookkeeping/fees'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import ErrorLabel from './ErrorLabel'
import { StripeError } from '@stripe/stripe-js'

export const PaymentLoadingForm = ({
  disableAnimation,
}: {
  disableAnimation?: boolean
}) => {
  return (
    <>
      <div className="flex flex-col gap-4">
        <Skeleton
          className="h-10 w-full"
          disableAnimation={disableAnimation}
        />
        <Skeleton
          className="h-10 w-full"
          disableAnimation={disableAnimation}
        />
        <div className="flex gap-4">
          <Skeleton
            className="h-10 w-1/2"
            disableAnimation={disableAnimation}
          />
          <Skeleton
            className="h-10 w-1/2"
            disableAnimation={disableAnimation}
          />
        </div>
        <Skeleton
          className="h-10 w-full"
          disableAnimation={disableAnimation}
        />
        <div className="flex gap-4">
          <Skeleton
            className="h-10 w-1/2"
            disableAnimation={disableAnimation}
          />
          <Skeleton
            className="h-10 w-1/2"
            disableAnimation={disableAnimation}
          />
        </div>
      </div>
      <div className="flex flex-col gap-4 py-3">
        <Skeleton
          className="h-10 w-full"
          disableAnimation={disableAnimation}
        />
        <Skeleton
          className="h-10 w-full"
          disableAnimation={disableAnimation}
        />
        <Skeleton
          className="h-10 w-full"
          disableAnimation={disableAnimation}
        />
      </div>
      <div className="flex flex-col gap-4 py-3">
        <Skeleton
          className="h-10 w-full"
          disableAnimation={disableAnimation}
        />
        <Skeleton
          className="h-10 w-full"
          disableAnimation={disableAnimation}
        />
        <Skeleton
          className="h-10 w-full"
          disableAnimation={disableAnimation}
        />
      </div>
    </>
  )
}

const AuthenticationElement = ({
  readonlyCustomerEmail,
  onChange,
  onReady,
  className,
}: {
  readonlyCustomerEmail: string | undefined | null
  onChange: LinkAuthenticationElementProps['onChange']
  className: string
  onReady: LinkAuthenticationElementProps['onReady']
}) => {
  const preventInteraction = readonlyCustomerEmail
    ? (
        e:
          | React.MouseEvent<HTMLDivElement>
          | React.KeyboardEvent<HTMLDivElement>
      ) => {
        e.preventDefault()
        e.stopPropagation()
      }
    : undefined

  return (
    <div
      className="relative"
      onMouseDown={preventInteraction}
      onKeyDown={preventInteraction}
    >
      <LinkAuthenticationElement
        options={
          readonlyCustomerEmail
            ? {
                defaultValues: { email: readonlyCustomerEmail },
              }
            : {}
        }
        onChange={onChange}
        onReady={onReady}
        className={cn(
          className,
          readonlyCustomerEmail && 'opacity-50'
        )}
      />
    </div>
  )
}

const paymentFormButtonLabel = ({
  checkoutBlocked,
  subscriptionDetails,
  feeCalculation,
  flowType,
  totalDueAmount,
  currency,
}: {
  checkoutBlocked: boolean
  subscriptionDetails: SubscriptionCheckoutDetails | null
  flowType: CheckoutFlowType
  totalDueAmount: number | null
  feeCalculation: FeeCalculation.CustomerRecord | null
  currency: CurrencyCode
}) => {
  if (checkoutBlocked) {
    return 'Processing'
  } else if (flowType === CheckoutFlowType.AddPaymentMethod) {
    return 'Add Payment Method'
  } else if (subscriptionDetails?.trialPeriodDays) {
    return `Start ${subscriptionDetails.trialPeriodDays} Day Trial`
  } else if (subscriptionDetails?.type === PriceType.Usage) {
    return `Start Plan`
  } else if (feeCalculation && !core.isNil(totalDueAmount)) {
    if (flowType === CheckoutFlowType.SinglePayment) {
      return `Pay ${stripeCurrencyAmountToHumanReadableCurrencyAmount(
        currency,
        totalDueAmount
      )}`
    } else if (flowType === CheckoutFlowType.Subscription) {
      return `Start ${stripeCurrencyAmountToHumanReadableCurrencyAmount(
        currency,
        totalDueAmount
      )} Subscription`
    }
  } else if (flowType === CheckoutFlowType.Subscription) {
    return `Start Subscription`
  }
  return 'Pay'
}

const PaymentForm = () => {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const checkoutPageContext = useCheckoutPageContext()
  const {
    redirectUrl,
    currency,
    checkoutSession,
    product,
    flowType,
    subscriptionDetails,
    customer,
    editCheckoutSessionCustomerEmail,
    editCheckoutSessionPaymentMethodType,
    editCheckoutSessionBillingAddress,
    checkoutBlocked,
    feeCalculation,
    readonlyCustomerEmail,
  } = checkoutPageContext
  const [emailEmbedReady, setEmailEmbedReady] = useState(true)
  const [paymentEmbedReady, setPaymentEmbedReady] = useState(false)
  const [addressEmbedReady, setAddressEmbedReady] = useState(true)
  const [paymentInfoComplete, setPaymentInfoComplete] =
    useState(false)
  const [emailComplete, setEmailComplete] = useState(
    Boolean(readonlyCustomerEmail)
  )
  const embedsReady =
    emailEmbedReady && paymentEmbedReady && addressEmbedReady
  const [errorMessage, setErrorMessage] = useState<
    string | undefined
  >(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const confirmCheckoutSession =
    trpc.purchases.confirmSession.useMutation()

  const totalDueAmount: number | null = feeCalculation
    ? calculateTotalDueAmount(feeCalculation)
    : null

  const buttonLabel = paymentFormButtonLabel({
    checkoutBlocked: checkoutBlocked ?? false,
    subscriptionDetails: subscriptionDetails ?? null,
    feeCalculation,
    flowType,
    totalDueAmount,
    currency,
  })

  return (
    <form
      className="w-[380px] relative"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        // We don't want to let default form submission happen here,
        // which would refresh the page.
        event.preventDefault()

        if (!stripe || !elements) {
          // Stripe.js hasn't yet loaded.
          // Make sure to disable form submission until Stripe.js has loaded.
          return
        }

        setIsSubmitting(true)

        try {
          await confirmCheckoutSession.mutateAsync({
            id: checkoutSession.id,
          })
        } catch (error: unknown) {
          setIsSubmitting(false)
          setErrorMessage((error as Error).message)
        }
        /**
         * If the total due amount is 0, and the price type is a single payment,
         * we cannot attempt to confirm a $0 payment. So we can redirect to the purchase page.
         */
        if (
          totalDueAmount === 0 &&
          flowType === CheckoutFlowType.SinglePayment
        ) {
          window.location.href = `${redirectUrl}?checkout_session=${checkoutPageContext.checkoutSession.id}`
          return
        }
        // Trigger form validation and wallet collection
        const submitResult = await elements.submit()
        const { error: submitError } = submitResult
        if (submitError) {
          setErrorMessage(submitError.message)
          setIsSubmitting(false)
          return
        }
        const confirmationFunction =
          flowType === CheckoutFlowType.Subscription ||
          flowType === CheckoutFlowType.AddPaymentMethod
            ? stripe.confirmSetup
            : stripe.confirmPayment
        const hasEmail = customer?.email
        // Create the ConfirmationToken using the details collected by the Payment Element
        // and additional shipping information
        const useConfirmSetup =
          flowType === CheckoutFlowType.Subscription ||
          flowType === CheckoutFlowType.AddPaymentMethod
        let error: StripeError | undefined
        if (useConfirmSetup) {
          try {
            const { error: confirmationError } =
              await stripe.confirmSetup({
                elements,
                confirmParams: {
                  return_url: redirectUrl,
                  payment_method_data: readonlyCustomerEmail
                    ? {
                        billing_details: {
                          email: readonlyCustomerEmail,
                        },
                      }
                    : undefined,
                },
              })
            error = confirmationError
          } catch (e) {
            setErrorMessage((e as Error).message)
            setIsSubmitting(false)
            return
          }
        } else {
          const { error: confirmationError } =
            await stripe.confirmPayment({
              elements,
              confirmParams: {
                return_url: redirectUrl,
                /**
                 * If we have a customer we want to use the customer email.
                 * Otherwise, we want to use the email collected from the email element.
                 */
                payment_method_data: {
                  billing_details: {
                    email: readonlyCustomerEmail,
                  },
                },
              },
            })
          error = confirmationError
        }
        if (error) {
          // This point will only be reached if there is an immediate error when
          // confirming the payment. Show error to your customer (for example, payment
          // details incomplete)
          setErrorMessage(error?.message)
        } else {
          // Your customer will be redirected to your `return_url`. For some payment
          // methods like iDEAL, your customer will be redirected to an intermediate
          // site first to authorize the payment, then redirected to the `return_url`.
        }
        setIsSubmitting(false)
      }}
    >
      {
        <div
          className={core.cn(
            'absolute inset-0 z-10 transition-opacity duration-300',
            embedsReady
              ? 'opacity-0 pointer-events-none'
              : 'opacity-100'
          )}
        >
          <PaymentLoadingForm />
        </div>
      }
      <div
        className={core.cn(
          'transition-opacity duration-300',
          !embedsReady && 'opacity-0'
        )}
      >
        <AuthenticationElement
          readonlyCustomerEmail={readonlyCustomerEmail}
          onChange={async (event) => {
            if (readonlyCustomerEmail) {
              return
            }
            if (event.complete) {
              await editCheckoutSessionCustomerEmail({
                id: checkoutSession.id,
                customerEmail: event.value.email,
              })
              setEmailComplete(true)
              router.refresh()
            }
          }}
          onReady={() => {
            setEmailEmbedReady(true)
          }}
          className={core.cn('pb-3', !embedsReady && 'opacity-0')}
        />
        <PaymentElement
          onReady={() => {
            // setTimeout(() => {
            setPaymentEmbedReady(true)
            // }, 300)
          }}
          options={{
            fields: {
              billingDetails: {
                email: readonlyCustomerEmail ? 'never' : undefined,
                address: 'never',
              },
            },
          }}
          onChange={async (e) => {
            if (e.complete) {
              await editCheckoutSessionPaymentMethodType({
                id: checkoutSession.id,
                paymentMethodType: e.value.type as PaymentMethodType,
              })
              setPaymentInfoComplete(true)
            }
          }}
          className={!embedsReady ? 'opacity-0' : ''}
        />
        <AddressElement
          options={{
            mode: 'billing',
            defaultValues:
              checkoutSession?.billingAddress ?? undefined,
          }}
          onReady={() => {
            // setTimeout(() => {
            setAddressEmbedReady(true)
            // }, 300)
          }}
          onChange={async (event) => {
            if (event.complete) {
              await editCheckoutSessionBillingAddress({
                id: checkoutSession.id,
                billingAddress: event.value,
              })
            }
          }}
          className={!embedsReady ? 'py-3 opacity-0' : 'py-3'}
        />
      </div>
      {embedsReady && (
        <>
          {flowType !== CheckoutFlowType.Invoice && (
            <DiscountCodeInput />
          )}
          <TotalBillingDetails />
          <div className="py-8">
            <Button
              className="justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 w-full h-[45px]"
              disabled={
                !paymentInfoComplete ||
                !emailComplete ||
                isSubmitting ||
                checkoutBlocked
              }
              iconLeading={
                isSubmitting ? (
                  <LoaderCircle
                    className="animate-spin-slow"
                    size={16}
                  />
                ) : undefined
              }
            >
              {buttonLabel}
            </Button>
            {errorMessage && <ErrorLabel error={errorMessage} />}
            {!product?.livemode && (
              <div className="p-2 bg-orange-600 justify-center items-center text-center w-full flex mt-4 rounded-md">
                <div className="text-white text-sm">
                  <p>This is a test mode checkout.</p>
                  <p>No payments will be processed.</p>
                </div>
              </div>
            )}
            <PoweredByFlowgladText />
          </div>
        </>
      )}
    </form>
  )
}

export default PaymentForm
