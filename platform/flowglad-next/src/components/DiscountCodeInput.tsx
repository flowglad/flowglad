import { useForm } from 'react-hook-form'
import { useCheckoutPageContext } from '@/contexts/checkoutPageContext'
import { useState, useCallback, useEffect, useRef } from 'react'
import debounce from 'debounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormDescription, FormMessage } from '@/components/ui/form'
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
        const code = data.discountCode
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
  }

  const clearDiscountCodeButton = (
    <Button
      onClick={async (e) => {
        e.preventDefault()
        if (purchase?.id) {
          await clearDiscountCode({
            purchaseId: purchase.id!,
          })
        } else if (product?.id) {
          await clearDiscountCode({
            productId: product.id!,
          })
        }
        setDiscountCodeStatus('idle')
        form.setValue('discountCode', '')
      }}
      variant="ghost"
      className="px-0 hover:bg-transparent focus-visible:ring-0 text-gray-600 hover:text-gray-800"
      disabled={!discount}
    >
      Clear
    </Button>
  )

  const applyDiscountCodeButton = (
    <Button
      onClick={form.handleSubmit(attemptHandler)}
      disabled={discountCodeStatus === 'loading'}
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
          className="text-[#0a0a0a] text-[14px] font-medium"
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
                        className="pr-12 border border-[#e5e7eb] bg-[#ffffff] text-[#0a0a0a] rounded-[8px] px-4 py-4 text-[14px] min-h-[44.39px] shadow-[0px_1px_1px_0px_rgba(10,10,11,0.06)] focus-visible:border-[#3b82f6] focus-visible:shadow-[0px_0px_0px_1px_inset_rgba(59,130,246,0.16)]"
                        autoCapitalize="characters"
                        {...field}
                        onChange={(e) => {
                          const code = e.target.value.toUpperCase()
                          field.onChange(code)
                        }}
                        onBlur={async (e) => {
                          field.onBlur()
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
                        {discount
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
            className={`text-sm ${discountCodeStatus === 'error' ? 'text-red-600' : 'text-gray-600'}`}
          >
            {hint}
          </div>
        )}
      </div>
    </Form>
  )
}
