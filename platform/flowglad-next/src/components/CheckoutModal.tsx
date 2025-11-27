'use client'
import { useSetCheckoutSessionCookieEffect } from '@/app/hooks/useSetCheckoutSessionCookieEffect'
import CheckoutForm from '@/components/CheckoutForm'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import CheckoutPageProvider from '@/contexts/checkoutPageContext'
import type { CheckoutInfoCore } from '@/db/tableMethods/purchaseMethods'
import { cn } from '@/lib/utils'

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
      <DialogContent className="w-[calc(100vw-32px)] sm:max-w-md max-h-[90vh] overflow-y-auto">
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
