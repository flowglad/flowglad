'use client'
import { CheckoutInfoCore } from '@/db/tableMethods/purchaseMethods'
import CheckoutForm from '@/components/CheckoutForm'
import CheckoutPageProvider from '@/contexts/checkoutPageContext'
import Modal from '@/components/ion/Modal'
import { cn } from '@/utils/core'
import { useSetCheckoutSessionCookieEffect } from '@/app/hooks/useSetCheckoutSessionCookieEffect'

interface CheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  checkoutInfo: CheckoutInfoCore
  title?: string
}

const CheckoutModal = ({
  isOpen,
  onClose,
  checkoutInfo,
  title,
}: CheckoutModalProps) => {
  useSetCheckoutSessionCookieEffect(checkoutInfo)

  const checkoutFormContainer = cn(
    'bg-internal',
    'w-full flex flex-1'
  )

  return (
    <Modal open={isOpen} onOpenChange={onClose} title={title}>
      <CheckoutPageProvider values={checkoutInfo}>
        <div className={checkoutFormContainer}>
          <CheckoutForm />
        </div>
      </CheckoutPageProvider>
    </Modal>
  )
}

export default CheckoutModal
