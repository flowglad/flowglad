'use client'
import {
  AddressElement,
  LinkAuthenticationElement,
  type LinkAuthenticationElementProps,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import type { StripeError } from '@stripe/stripe-js'
import { LoaderCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'
import { z } from 'zod'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  type SubscriptionCheckoutDetails,
  useCheckoutPageContext,
} from '@/contexts/checkoutPageContext'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import { billingAddressSchema } from '@/db/schema/organizations'
import { cn } from '@/lib/utils'
import {
  CheckoutFlowType,
  CheckoutSessionStatus,
  type CurrencyCode,
  type PaymentMethodType,
  PriceType,
} from '@/types'
import { calculateTotalDueAmount } from '@/utils/bookkeeping/fees/common'
import core from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { TotalBillingDetails } from './checkout/total-billing-details'
import DiscountCodeInput from './DiscountCodeInput'
import ErrorLabel from './ErrorLabel'
import { PoweredByFlowglad } from './powered-by-flowglad'

// Utility function to force reflow for Stripe iframes to prevent rendering issues
const forceStripeElementsReflow = () => {
  // Force reflow on all Stripe Elements containers
  const stripeElements = document.querySelectorAll(
    '.StripeElement, [data-testid*="stripe"], iframe[name*="__privateStripe"]'
  )
  stripeElements.forEach((element) => {
    if (element instanceof HTMLElement) {
      const initialDisplay = element.style.display
      element.style.display = 'none'
      element.offsetHeight // Trigger reflow
      element.style.display = initialDisplay || ''
    }
  })

  // Simple reflow for iframe containers - let Appearance API handle styling
  setTimeout(() => {
    const iframes = document.querySelectorAll(
      'iframe[name*="__privateStripe"], iframe[title*="Google autocomplete"]'
    )
    iframes.forEach((iframe) => {
      if (iframe instanceof HTMLElement && iframe.parentElement) {
        const parent = iframe.parentElement
        const initialDisplay = parent.style.display
        parent.style.display = 'none'
        parent.offsetHeight // Trigger reflow
        parent.style.display = initialDisplay || ''
      }
    })
  }, 100)
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
  // Simplified: Always editable since users only see checkout pages with Open sessions
  // readonlyCustomerEmail is only used for pre-filling, never for readonly state
  return (
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
      className={className}
    />
  )
}

const paymentFormButtonLabel = ({
  checkoutBlocked,
  subscriptionDetails,
  feeCalculation,
  flowType,
  totalDueAmount,
  currency,
  isEligibleForTrial,
}: {
  checkoutBlocked: boolean
  subscriptionDetails: SubscriptionCheckoutDetails | null
  flowType: CheckoutFlowType
  totalDueAmount: number | null
  feeCalculation: FeeCalculation.CustomerRecord | null
  currency: CurrencyCode
  isEligibleForTrial?: boolean
}) => {
  if (checkoutBlocked) {
    return 'Processing'
  } else if (flowType === CheckoutFlowType.AddPaymentMethod) {
    return 'Add Payment Method'
  } else if (
    subscriptionDetails?.trialPeriodDays &&
    isEligibleForTrial
  ) {
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

  // Fallback case - include amount if available
  if (totalDueAmount && !core.isNil(totalDueAmount)) {
    return `Pay ${stripeCurrencyAmountToHumanReadableCurrencyAmount(
      currency,
      totalDueAmount
    )}`
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
    flowType,
    subscriptionDetails,
    editCheckoutSessionCustomerEmail,
    editCheckoutSessionPaymentMethodType,
    editCheckoutSessionBillingAddress,
    editCheckoutSessionAutomaticallyUpdateSubscriptions,
    checkoutBlocked,
    feeCalculation,
    readonlyCustomerEmail,
    isEligibleForTrial,
    customerSessionClientSecret,
  } = checkoutPageContext
  const [emailEmbedReady, setEmailEmbedReady] = useState(true)
  const [paymentEmbedReady, setPaymentEmbedReady] = useState(false)
  const [addressEmbedReady, setAddressEmbedReady] = useState(true)
  const [paymentInfoComplete, setPaymentInfoComplete] =
    useState(false)
  const [emailComplete, setEmailComplete] = useState(
    // Start as complete if there's a pre-filled email
    Boolean(readonlyCustomerEmail)
  )
  const [emailError, setEmailError] = useState<string | undefined>(
    undefined
  )
  const [addressError, setAddressError] = useState<
    string | undefined
  >(undefined)
  const embedsReady =
    emailEmbedReady && paymentEmbedReady && addressEmbedReady
  const [errorMessage, setErrorMessage] = useState<
    string | undefined
  >(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [savePaymentMethodForFuture, setSavePaymentMethodForFuture] =
    useState(false)
  const [isUsingSavedPaymentMethod, setIsUsingSavedPaymentMethod] =
    useState(false)
  const confirmCheckoutSession =
    trpc.checkoutSessions.public.confirm.useMutation()

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
    isEligibleForTrial,
  })
  const showDiscountCodeInput =
    flowType !== CheckoutFlowType.Invoice &&
    flowType !== CheckoutFlowType.AddPaymentMethod

  // Determine if this is a SetupIntent flow (Subscription or AddPaymentMethod)
  const isSetupIntentFlow =
    flowType === CheckoutFlowType.Subscription ||
    flowType === CheckoutFlowType.AddPaymentMethod
  // Show consent checkbox when:
  // - CustomerSession exists (saved methods available)
  // - AND user is entering a new payment method (not using a saved one)
  // - AND NOT a SetupIntent flow (consent is implicit for SetupIntent flows)
  // For SetupIntent flows (Subscription, AddPaymentMethod), allow_redisplay is always set to 'always'
  // For PaymentIntent flows (SinglePayment), consent controls setup_future_usage
  const showSavePaymentMethodForFuture =
    Boolean(customerSessionClientSecret) &&
    !isUsingSavedPaymentMethod &&
    !isSetupIntentFlow

  // Force reflow when all embeds are ready to prevent iframe transparency issues
  useEffect(() => {
    if (embedsReady) {
      // Delay to ensure all Stripe iframes are fully rendered
      const timeoutId = setTimeout(() => {
        forceStripeElementsReflow()
      }, 200)

      return () => clearTimeout(timeoutId)
    }
  }, [embedsReady])

  // Simplified reflow trigger when address field gains focus - let Appearance API handle styling
  useEffect(() => {
    const handleFocus = () => {
      // Small delay to allow iframe to be created before forcing reflow
      setTimeout(forceStripeElementsReflow, 50)
    }

    // Listen for focus events on address field containers
    const addressContainers = document.querySelectorAll(
      '[data-testid*="address"], .StripeElement'
    )
    addressContainers.forEach((container) => {
      container.addEventListener('focus', handleFocus, true)
    })

    return () => {
      addressContainers.forEach((container) => {
        container.removeEventListener('focus', handleFocus, true)
      })
    }
  }, [embedsReady])

  return (
    <form
      className={cn(
        'w-full relative', // Remove fixed width
        'flex flex-col gap-2', // Reduced gap pattern
        'sm:max-w-[496px]' // LS form max-width from 640px+
      )}
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

        // Validate payment method before proceeding
        if (!checkoutSession.paymentMethodType) {
          setErrorMessage('Please select a payment method')
          setIsSubmitting(false)
          return
        }

        // Validate address before proceeding
        if (!checkoutSession.billingAddress) {
          setAddressError('Please fill in your billing address')
          setIsSubmitting(false)
          return
        }

        const addressValidation = billingAddressSchema.safeParse(
          checkoutSession.billingAddress
        )

        if (!addressValidation.success) {
          setAddressError(
            'Please fill in all required address fields'
          )
          setIsSubmitting(false)
          return
        }

        // Clear any previous address errors
        setAddressError(undefined)

        try {
          await confirmCheckoutSession.mutateAsync({
            id: checkoutSession.id,
            savePaymentMethodForFuture,
          })
        } catch (error: unknown) {
          setIsSubmitting(false)
          setErrorMessage((error as Error).message)
          return
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
          if (submitError.message === 'This field is incomplete.') {
            setErrorMessage('Please complete all required fields.')
          } else {
            setErrorMessage(submitError.message)
          }
          setIsSubmitting(false)
          return
        }
        // Create the ConfirmationToken using the details collected by the Payment Element
        // and additional shipping information
        const useConfirmSetup =
          flowType === CheckoutFlowType.Subscription ||
          flowType === CheckoutFlowType.AddPaymentMethod

        // Build payment_method_data with billing details and allow_redisplay
        type PaymentMethodData =
          | {
              billing_details: { email: string; name?: string }
              allow_redisplay?: 'always'
            }
          | undefined

        // EXPERIMENTAL: Fallback to checkoutSession.customerEmail to avoid a race condition
        // where LinkAuthenticationElement might not be passing email correctly at the time
        // of confirmSetup(). Stripe should automatically extract email from LinkAuthenticationElement,
        // but this fallback ensures we explicitly pass it when available from either source.
        const customerEmail =
          readonlyCustomerEmail ||
          checkoutSession.customerEmail ||
          null

        // For SetupIntent flows (Subscription, AddPaymentMethod), always set allow_redisplay
        // For PaymentIntent flows (SinglePayment), only set if user consented via toggle
        const paymentMethodData: PaymentMethodData = customerEmail
          ? {
              billing_details: {
                email: customerEmail,
                // Name will be collected from AddressElement
                name:
                  checkoutSession.billingAddress?.name ?? undefined,
              },
              ...((isSetupIntentFlow ||
                savePaymentMethodForFuture) && {
                allow_redisplay: 'always' as const,
              }),
            }
          : undefined

        let error: StripeError | undefined
        if (useConfirmSetup) {
          try {
            const { error: confirmationError } =
              await stripe.confirmSetup({
                elements,
                confirmParams: {
                  return_url: redirectUrl,
                  payment_method_data: paymentMethodData,
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
                payment_method_data: paymentMethodData,
              },
            })
          error = confirmationError
        }
        if (error) {
          // This point will only be reached if there is an immediate error when
          // confirming the payment. Show error to your customer (for example, payment
          // details incomplete)
          const errorMessage = error?.message || ''

          if (
            errorMessage.includes('fields.billing_details.email') &&
            errorMessage.includes(
              'confirmParams.payment_method_data.billing_details.email'
            )
          ) {
            core.error(error)
          }

          setErrorMessage(errorMessage)
        } else {
          // Your customer will be redirected to your `return_url`. For some payment
          // methods like iDEAL, your customer will be redirected to an intermediate
          // site first to authorize the payment, then redirected to the `return_url`.
        }
        setIsSubmitting(false)
      }}
    >
      {/* Main form content */}
      <div className="space-y-3">
        {/* Email Section */}
        <div className="space-y-3">
          <AuthenticationElement
            readonlyCustomerEmail={readonlyCustomerEmail}
            onChange={async (event) => {
              // Simplified: Always allow editing since we only show checkout pages for Open sessions
              if (
                event.complete &&
                checkoutSession.status === CheckoutSessionStatus.Open
              ) {
                const parseResult = z
                  .email()
                  .safeParse(event.value.email)
                if (parseResult.success) {
                  try {
                    await editCheckoutSessionCustomerEmail({
                      id: checkoutSession.id,
                      customerEmail: parseResult.data,
                    })
                    setEmailComplete(true)
                    setEmailError(undefined)
                    router.refresh()
                  } catch (error) {
                    console.warn(
                      'Failed to update customer email:',
                      error
                    )
                  }
                } else {
                  setEmailError(
                    JSON.parse(parseResult.error.message)[0].message
                  )
                }
              }
            }}
            onReady={() => {
              setEmailEmbedReady(true)
            }}
            className={cn('w-full', !embedsReady && 'opacity-0')}
          />
          {emailError && (
            <ErrorLabel error={emailError} className="mt-2" />
          )}
        </div>

        {/* Payment Method Section */}
        <div className="space-y-3">
          <div className="pb-0">
            <PaymentElement
              onReady={() => {
                setPaymentEmbedReady(true)
              }}
              options={{
                fields: {
                  billingDetails: {
                    // Always hide email - use AuthenticationElement instead
                    email: 'never',
                    // Always hide name - use AddressElement instead
                    name: 'never',
                    address: 'never',
                  },
                },
                terms: {
                  wallets: 'never',
                  auBankAccount: 'never',
                  bancontact: 'never',
                  card: 'never',
                  ideal: 'never',
                  p24: 'never',
                  sepaDebit: 'never',
                  sofort: 'never',
                  usBankAccount: 'never',
                } as any,
              }}
              onChange={async (e) => {
                // A saved payment method will have a payment_method object with an id
                const isSavedPaymentMethod = Boolean(
                  e.value?.payment_method?.id
                )
                setIsUsingSavedPaymentMethod(isSavedPaymentMethod)

                // Reset consent toggle when switching to a saved payment method
                // (it doesn't make sense to save a payment method that's already saved)
                if (isSavedPaymentMethod) {
                  setSavePaymentMethodForFuture(false)
                }

                if (
                  e.complete &&
                  checkoutSession.status ===
                    CheckoutSessionStatus.Open
                ) {
                  try {
                    await editCheckoutSessionPaymentMethodType({
                      id: checkoutSession.id,
                      paymentMethodType: e.value
                        .type as PaymentMethodType,
                    })
                    setPaymentInfoComplete(true)
                  } catch (error) {
                    console.warn(
                      'Failed to update payment method type:',
                      error
                    )
                  }
                }
              }}
              className={!embedsReady ? 'opacity-0' : ''}
            />
          </div>
        </div>

        {/* Billing Address Section */}
        <div className="space-y-3">
          <AddressElement
            options={{
              mode: 'billing',
              defaultValues:
                checkoutSession?.billingAddress ?? undefined,
              // Re-enabling autocomplete now that Appearance API is fixed
              autocomplete: {
                mode: 'automatic',
              },
            }}
            onReady={() => {
              setAddressEmbedReady(true)
              // Simple reflow to ensure proper rendering
              setTimeout(forceStripeElementsReflow, 100)
            }}
            onChange={async (event) => {
              if (
                checkoutSession.status === CheckoutSessionStatus.Open
              ) {
                try {
                  await editCheckoutSessionBillingAddress({
                    id: checkoutSession.id,
                    billingAddress: event.value,
                  })
                  // Clear any previous address errors when user starts typing
                  setAddressError(undefined)
                } catch (error) {
                  // Silently handle errors for non-open sessions
                  console.warn(
                    'Failed to update billing address:',
                    error
                  )
                }
              }
            }}
            className={!embedsReady ? 'opacity-0' : ''}
          />
          {addressError && (
            <ErrorLabel error={addressError} className="mt-2" />
          )}
        </div>
      </div>
      {/* Form Footer - Order Summary & Actions */}
      {embedsReady && (
        <div className="space-y-6 pt-1">
          {showDiscountCodeInput && (
            <div className="space-y-3">
              <DiscountCodeInput />
            </div>
          )}
          {/* Order Summary */}
          <div className="space-y-4">
            <TotalBillingDetails />
          </div>
          {/* Auto Update Subscriptions */}
          {flowType === CheckoutFlowType.AddPaymentMethod && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Switch
                  id="auto-update-subscriptions"
                  checked={
                    checkoutSession.automaticallyUpdateSubscriptions ??
                    false
                  }
                  onCheckedChange={async (checked) => {
                    await editCheckoutSessionAutomaticallyUpdateSubscriptions(
                      {
                        id: checkoutSession.id,
                        automaticallyUpdateSubscriptions: checked,
                      }
                    )
                  }}
                />
                <Label
                  htmlFor="auto-update-subscriptions"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Set as default method for existing subscriptions
                </Label>
              </div>
            </div>
          )}
          {/* Save Payment Method for Future Checkouts */}
          {showSavePaymentMethodForFuture && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Switch
                  id="save-payment-method-for-future"
                  checked={savePaymentMethodForFuture}
                  onCheckedChange={(checked) => {
                    setSavePaymentMethodForFuture(checked)
                  }}
                  className="data-[state=checked]:bg-gray-900 data-[state=unchecked]:bg-gray-200 [&>span]:bg-white"
                />
                <Label
                  htmlFor="save-payment-method-for-future"
                  className="text-sm text-gray-600 font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Save this payment method for future checkouts
                </Label>
              </div>
            </div>
          )}
          {/* Primary Action Button */}
          <div className="pt-2">
            <Button
              className={cn(
                'w-full h-[52px]', // LS button height
                'bg-gray-950 hover:bg-gray-950/90', // LS button color (darker, closer to black)
                'text-slate-50 font-normal', // LS button text (fixed light mode foreground)
                'rounded-[8px]', // LS border radius
                'text-[16px] leading-[28px]', // LS typography
                'transition-all duration-200', // Smooth transitions
                'disabled:!pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50',
                // Hover states
                'hover:cursor-pointer',
                'disabled:hover:cursor-not-allowed' // Override hover cursor when disabled
              )}
              disabled={
                !paymentInfoComplete ||
                !emailComplete ||
                isSubmitting ||
                checkoutBlocked
              }
            >
              {isSubmitting && (
                <LoaderCircle
                  className="animate-spin-slow w-4 h-4 mr-2"
                  size={16}
                />
              )}
              {buttonLabel}
            </Button>
            {errorMessage && (
              <ErrorLabel error={errorMessage} className="mt-3" />
            )}
            {!checkoutSession.livemode &&
              flowType !== CheckoutFlowType.AddPaymentMethod && (
                <div className="p-4 bg-gray-50 border border-gray-200 justify-center items-center text-center w-full flex mt-6 rounded-[8px]">
                  <div className="text-gray-600 text-sm">
                    <p>This is a test mode checkout.</p>
                    <p>No payments will be processed.</p>
                  </div>
                </div>
              )}
          </div>
          {/* Security Notice */}
          {flowType !== CheckoutFlowType.AddPaymentMethod && (
            <div
              className={cn(
                'bg-gray-50 border border-gray-200', // Light background for white theme
                'rounded-[8px] p-4',
                'flex items-center justify-center gap-1.5'
              )}
            >
              <div className="w-6 h-6 text-gray-500">
                {/* Security icon - filled */}
                <svg
                  className="w-full h-full"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2ZM9 6a3 3 0 0 1 6 0v2H9V6Zm3 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
                </svg>
              </div>
              <span className="text-[13px] text-gray-600 leading-[24px]">
                Payments are secure and encrypted
              </span>
            </div>
          )}
          {/* Footer Links */}
          <div className="flex flex-col items-center gap-1 pt-4">
            <PoweredByFlowglad />
            <div className="flex items-center gap-2.5 text-[13px] text-gray-600">
              <a
                href="https://www.flowglad.com/terms-of-service"
                className="hover:text-gray-800 transition-colors"
              >
                Terms
              </a>
              <span>·</span>
              <a
                href="https://www.flowglad.com/privacy-policy"
                className="hover:text-gray-800 transition-colors"
              >
                Privacy
              </a>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}

export default PaymentForm
