import Input from '@/components/ion/Input'
import { useCheckoutPageContext } from '@/contexts/checkoutPageContext'
import { useState } from 'react'
import Hint from './ion/Hint'
import Button from './ion/Button'
import Label from './ion/Label'
import { CheckoutFlowType } from '@/types'

export default function DiscountCodeInput() {
  const checkoutPageContext = useCheckoutPageContext()
  const { discount, flowType } = checkoutPageContext
  const [discountCodeStatus, setDiscountCodeStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >(discount ? 'success' : 'idle')
  const [discountCode, setDiscountCode] = useState(
    discount?.code ?? ''
  )

  if (flowType === CheckoutFlowType.Invoice) {
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
  const attemptHandler = async (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.preventDefault()
    const code = discountCode
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
  }

  const clearDiscountCodeButton = (
    <Button
      onClick={async (e) => {
        e.preventDefault()
        await clearDiscountCode({
          purchaseId: purchase?.id,
          productId: product.id,
        })
        setDiscountCodeStatus('idle')
        setDiscountCode('')
      }}
      variant="ghost"
      disabled={!discount}
    >
      Clear
    </Button>
  )
  const applyDiscountCodeButton = (
    <Button
      onClick={attemptHandler}
      disabled={discountCodeStatus === 'loading'}
      variant="ghost"
    >
      Apply
    </Button>
  )
  return (
    <div className="flex flex-col gap-1 w-full">
      <Label>Discount Code</Label>
      <div className="flex flex-row gap-2 w-full">
        <Input
          className="w-full"
          autoCapitalize="characters"
          value={discountCode}
          inputClassName="focus-within:bg-[#353535] p-2 pl-3 pr-0 h-15 border-none bg-[#353535]"
          onChange={(event) => {
            const code = event.target.value.toUpperCase()
            setDiscountCode(code)
          }}
          iconTrailing={
            discount
              ? clearDiscountCodeButton
              : applyDiscountCodeButton
          }
        />
      </div>
      <Hint error={discountCodeStatus === 'error'}>{hint}</Hint>
    </div>
  )
}
