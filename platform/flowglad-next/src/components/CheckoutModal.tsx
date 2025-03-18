'use client'
import { BillingInfoCore } from '@/db/tableMethods/purchaseMethods'
import CheckoutForm from '@/components/CheckoutForm'
import CheckoutPageProvider from '@/contexts/checkoutPageContext'
import Modal from '@/components/ion/Modal'
import { cn } from '@/utils/core'
import { useSetCheckoutSessionCookieEffect } from '@/app/hooks/useSetCheckoutSessionCookieEffect'

interface CheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  billingInfo: BillingInfoCore
  title?: string
}

const CheckoutModal = ({
  isOpen,
  onClose,
  billingInfo,
  title,
}: CheckoutModalProps) => {
  useSetCheckoutSessionCookieEffect(billingInfo)

  const checkoutFormContainer = cn(
    'bg-internal',
    'w-full flex flex-1'
  )

  return (
    <Modal open={isOpen} onOpenChange={onClose} title={title}>
      <CheckoutPageProvider values={billingInfo}>
        <div className={checkoutFormContainer}>
          <CheckoutForm />
        </div>
      </CheckoutPageProvider>
    </Modal>
  )
}

export default CheckoutModal
