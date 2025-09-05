'use client'
import { CheckoutInfoCore } from '@/db/tableMethods/purchaseMethods'
import CheckoutForm from '@/components/CheckoutForm'
import CheckoutPageProvider from '@/contexts/checkoutPageContext'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
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
    'bg-background',
    'w-full flex flex-1'
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        {title && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}
        <CheckoutPageProvider values={checkoutInfo}>
          <div className={checkoutFormContainer}>
            <CheckoutForm />
          </div>
        </CheckoutPageProvider>
      </DialogContent>
    </Dialog>
  )
}

export default CheckoutModal
