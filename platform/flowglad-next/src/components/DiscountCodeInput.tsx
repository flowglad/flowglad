import { useForm } from 'react-hook-form'
import { useCheckoutPageContext } from '@/contexts/checkoutPageContext'
import { useState, useCallback, useEffect, useRef } from 'react'
import debounce from 'debounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormDescription } from '@/components/ui/form'
import { CheckoutFlowType } from '@/types'
import {
  Form,
  FormField,
  FormItem,
  FormControl,
} from '@/components/ui/form'

interface DiscountCodeFormData {
  discountCode: string
}

export default function DiscountCodeInput() {
  const checkoutPageContext = useCheckoutPageContext()
  const { discount, flowType } = checkoutPageContext
  const [discountCodeStatus, setDiscountCodeStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >(discount ? 'success' : 'idle')
  const [isTouched, setIsTouched] = useState(false)

  const form = useForm<DiscountCodeFormData>({
    defaultValues: {
      discountCode: discount?.code ?? '',
    },
  })

  const discountCode = form.watch('discountCode')

  const { attemptDiscountCode, clearDiscountCode } =
    checkoutPageContext

  // Extract purchase and product from context with proper type checking
  const purchase =
    'purchase' in checkoutPageContext
      ? checkoutPageContext.purchase
      : undefined
  const product =
    'product' in checkoutPageContext
      ? checkoutPageContext.product
      : undefined

  const attemptHandler = useCallback(
    async (data: DiscountCodeFormData) => {
      try {
        const code = data.discountCode.trim()
        let discountSucceeded = false
        setDiscountCodeStatus('loading')
        if (purchase) {
          const result = await attemptDiscountCode({
            code,
            purchaseId: purchase.id,
          })
          discountSucceeded = result?.isValid
        } else if (product) {
          const result = await attemptDiscountCode({
            code,
            productId: product.id,
          })
          discountSucceeded = result?.isValid
        }
        if (discountSucceeded) {
          setDiscountCodeStatus('success')
        } else {
          setDiscountCodeStatus('error')
        }
      } catch (error) {
        setDiscountCodeStatus('error')
      }
    },
    [attemptDiscountCode, purchase, product]
  )

  const debouncedAttemptHandlerRef = useRef<ReturnType<
    typeof debounce
  > | null>(null)

  useEffect(() => {
    // Create the debounced function
    debouncedAttemptHandlerRef.current = debounce(attemptHandler, 300)

    // Cleanup function to cancel pending debounced calls
    return () => {
      if (debouncedAttemptHandlerRef.current) {
        debouncedAttemptHandlerRef.current.clear()
        debouncedAttemptHandlerRef.current = null
      }
    }
  }, [attemptHandler])

  const debouncedAttemptHandler = debouncedAttemptHandlerRef.current

  if (
    flowType === CheckoutFlowType.Invoice ||
    flowType === CheckoutFlowType.AddPaymentMethod
  ) {
    return null
  }

  let hint: string | undefined = undefined
  if (discountCodeStatus === 'error') {
    hint = 'Invalid discount code'
  } else if (discountCodeStatus === 'loading') {
    hint = 'Checking discount code...'
  } else if (discountCodeStatus === 'success') {
    hint = 'Discount code applied!'
  } else if (isTouched && !discountCode.trim()) {
    hint = 'Please enter a discount code'
  }

  const clearDiscountCodeButton = (
    <Button
      onClick={async (e) => {
        e.preventDefault()
        setDiscountCodeStatus('idle')
        setIsTouched(false)
        form.setValue('discountCode', '')
        /**
         * NOTE: this optimistically clears the discount code
         * without waiting for the server to respond. In almost all
         * cases, this should be fine.
         *
         * The rare edge cases is if the clearDiscountCode mutation
         * fails
         */
        if (purchase?.id) {
          await clearDiscountCode({
            purchaseId: purchase.id!,
          })
        } else if (product?.id) {
          await clearDiscountCode({
            productId: product.id!,
          })
        }
      }}
      variant="ghost"
      className="px-0 hover:bg-transparent focus-visible:ring-0 text-gray-600 hover:text-gray-800"
      disabled={discountCodeStatus === 'loading'}
    >
      Clear
    </Button>
  )

  const applyDiscountCodeButton = (
    <Button
      onClick={form.handleSubmit(attemptHandler)}
      disabled={
        discountCodeStatus === 'loading' || !discountCode.trim()
      }
      variant="ghost"
      className="px-0 hover:bg-transparent focus-visible:ring-0 text-gray-600 hover:text-gray-800"
    >
      Apply
    </Button>
  )

  return (
    <Form {...form}>
      <div className="flex flex-col gap-1 w-full">
        <Label
          htmlFor="discountCode"
          className="text-[#0a0a0a] text-[13px] font-medium"
        >
          Discount Code
        </Label>
        <div className="flex flex-row gap-2 w-full">
          <div className="flex-1">
            <FormField
              control={form.control}
              name="discountCode"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <Input
                        id="discountCode"
                        className="discount-input-focus pr-12 border border-[#e5e7eb] bg-[#ffffff] text-[#0a0a0a] rounded-[8px] px-4 py-3 text-[14px] min-h-[42.09px] leading-[1.3] transition-colors focus-visible:outline-none focus-visible:border-[#0a0a0a] focus-visible:ring-0"
                        style={{
                          boxShadow:
                            '0px 1px 1px rgba(0, 0, 0, 0.03), 0px 3px 6px rgba(0, 0, 0, 0.02)',
                        }}
                        disabled={discountCodeStatus === 'loading'}
                        autoCapitalize="characters"
                        {...field}
                        onChange={(e) => {
                          const code = e.target.value.toUpperCase()
                          field.onChange(code)
                          setIsTouched(true)
                        }}
                        onBlur={async (e) => {
                          field.onBlur()
                          setIsTouched(true)
                          const code = e.target.value.trim()
                          if (
                            code &&
                            code !== discount?.code &&
                            debouncedAttemptHandler
                          ) {
                            debouncedAttemptHandler({
                              discountCode: code,
                            })
                          }
                        }}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {discount || discountCodeStatus !== 'idle'
                          ? clearDiscountCodeButton
                          : applyDiscountCodeButton}
                      </div>
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>
        {hint && (
          <div
            className={`text-sm ${discountCodeStatus === 'error' || (isTouched && !discountCode.trim()) ? 'text-red-600' : 'text-gray-600'}`}
          >
            {hint}
          </div>
        )}
      </div>
    </Form>
  )
}
