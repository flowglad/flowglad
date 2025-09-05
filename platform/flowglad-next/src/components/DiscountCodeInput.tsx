import { useForm } from 'react-hook-form'
import { useCheckoutPageContext } from '@/contexts/checkoutPageContext'
import { useState } from 'react'
import debounce from 'debounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Hint from './ion/Hint'
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

  if (
    flowType === CheckoutFlowType.Invoice ||
    flowType === CheckoutFlowType.AddPaymentMethod
  ) {
    return null
  }

  const {
    attemptDiscountCode,
    purchase,
    product,
    clearDiscountCode,
  } = checkoutPageContext

  let hint: string | undefined = undefined
  if (discountCodeStatus === 'error') {
    hint = 'Invalid discount code'
  } else if (discountCodeStatus === 'loading') {
    hint = 'Checking discount code...'
  } else if (discountCodeStatus === 'success') {
    hint = 'Discount code applied!'
  }

  const attemptHandler = async (data: DiscountCodeFormData) => {
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
  }

  const debouncedAttemptHandler = debounce(attemptHandler, 300)

  const clearDiscountCodeButton = (
    <Button
      onClick={async (e) => {
        e.preventDefault()
        await clearDiscountCode({
          purchaseId: purchase?.id,
          productId: product.id,
        })
        setDiscountCodeStatus('idle')
        form.setValue('discountCode', '')
      }}
      variant="ghost"
      className="px-0 hover:bg-transparent focus-visible:ring-0 text-muted-foreground"
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
      className="px-0 hover:bg-transparent focus-visible:ring-0 text-muted-foreground"
    >
      Apply
    </Button>
  )

  return (
    <Form {...form}>
      <div className="flex flex-col gap-1 w-full">
        <Label htmlFor="discountCode">Discount Code</Label>
        <div className="flex flex-row gap-2 w-full">
          <div className="flex-1">
            <FormField
              control={form.control}
              name="discountCode"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      id="discountCode"
                      className="h-11 bg-[#353535] focus-visible:bg-[#353535] border-none"
                      autoCapitalize="characters"
                      iconTrailing={
                        discount
                          ? clearDiscountCodeButton
                          : applyDiscountCodeButton
                      }
                      {...field}
                      onChange={(e) => {
                        const code = e.target.value.toUpperCase()
                        field.onChange(code)
                      }}
                      onBlur={async (e) => {
                        field.onBlur()
                        const code = e.target.value.trim()
                        if (code && code !== discount?.code) {
                          debouncedAttemptHandler({
                            discountCode: code,
                          })
                        }
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>
        <Hint error={discountCodeStatus === 'error'}>{hint}</Hint>
      </div>
    </Form>
  )
}
