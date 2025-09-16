'use client'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import {
  EditPriceInput,
  editPriceSchema,
  Price,
} from '@/db/schema/prices'

interface ArchivePriceModalProps {
  trigger?: React.ReactNode
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  price: Price.ClientRecord
}

export const priceToArchivePriceInput = (
  price: Pick<
    Price.ClientRecord,
    'id' | 'productId' | 'active' | 'type'
  >
): EditPriceInput => {
  return {
    id: price.id,
    price: {
      id: price.id,
      productId: price.productId,
      active: !price.active,
      type: price.type,
    },
  }
}

const ArchivePriceModal: React.FC<ArchivePriceModalProps> = ({
  trigger,
  isOpen,
  setIsOpen,
  price,
}) => {
  const router = useRouter()
  const editPrice = trpc.prices.edit.useMutation()

  const handleArchive = async () => {
    const data = priceToArchivePriceInput(price)
    const parsed = editPriceSchema.safeParse(data)
    if (!parsed.success) {
      console.error('Invalid data:', parsed.error)
      return
    }

    await editPrice.mutateAsync(parsed.data)
    router.refresh()
    setIsOpen(false)
  }

  const modalText = price.active ? (
    <div className="text-muted-foreground gap-4">
      <p>Archiving will hide this price from new purchases.</p>
      <p>Are you sure you want to archive this price?</p>
    </div>
  ) : (
    <div className="text-muted-foreground gap-4">
      <p className="text-muted-foreground pb-4">
        Unarchiving will make this price available for new purchases.
      </p>
      <p className="text-muted-foreground pb-4">
        Are you sure you want to unarchive this price?
      </p>
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {price.active ? 'Archive price' : 'Unarchive price'}
          </DialogTitle>
        </DialogHeader>
        {modalText}
        <DialogFooter>
          <div className="flex justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleArchive}
              disabled={editPrice.isPending}
            >
              {price.active ? 'Archive price' : 'Unarchive price'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ArchivePriceModal
