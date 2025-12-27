'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Discount,
  editDiscountInputSchema,
} from '@/db/schema/discounts'

interface ToggleDiscountModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  discount: Discount.ClientRecord
}

/**
 * Modal for activating/deactivating a discount
 *
 * When deactivating:
 * - Prevents new redemptions of this discount code
 * - Existing active redemptions continue to apply
 *
 * When activating:
 * - Allows new redemptions of this discount code
 */
const ToggleDiscountModal: React.FC<ToggleDiscountModalProps> = ({
  isOpen,
  setIsOpen,
  discount,
}) => {
  const router = useRouter()
  const updateDiscount = trpc.discounts.update.useMutation()

  const handleToggleActive = async () => {
    const data = {
      id: discount.id,
      discount: {
        ...discount,
        active: !discount.active,
      },
    }

    const parsed = editDiscountInputSchema.safeParse(data)
    if (!parsed.success) {
      const errorMessage = parsed.error.issues
        .map((issue) => issue.message)
        .join(', ')
      toast.error(errorMessage || 'Invalid discount data')
      return
    }

    try {
      await updateDiscount.mutateAsync(parsed.data)
      toast.success(
        `Discount ${discount.active ? 'deactivated' : 'activated'} successfully`
      )
      router.refresh()
      setIsOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${discount.active ? 'deactivate' : 'activate'} discount`
      )
    }
  }

  const modalText = discount.active ? (
    <div className="text-muted-foreground flex flex-col gap-4">
      <p>
        Deactivating will prevent new redemptions of this discount
        code.
      </p>
      <p>
        Existing active redemptions will continue to apply their
        discounts until they expire.
      </p>
    </div>
  ) : (
    <div className="text-muted-foreground flex flex-col gap-4">
      <p>
        Activating will allow customers to use this discount code at
        checkout.
      </p>
      <p>Are you sure you want to activate this discount?</p>
    </div>
  )

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!updateDiscount.isPending) {
          setIsOpen(open)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {discount.active
              ? 'Deactivate discount'
              : 'Activate discount'}
          </DialogTitle>
        </DialogHeader>
        {modalText}
        <DialogFooter>
          <div className="flex flex-1 justify-end gap-2 w-full">
            <Button
              variant="secondary"
              size="default"
              onClick={() => setIsOpen(false)}
              disabled={updateDiscount.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="default"
              onClick={handleToggleActive}
              disabled={updateDiscount.isPending}
            >
              {discount.active
                ? 'Deactivate discount'
                : 'Activate discount'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ToggleDiscountModal
