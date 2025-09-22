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
  editPriceSchema,
  EditPriceInput,
  Price,
} from '@/db/schema/prices'
import { PriceType } from '@/types'

interface SetPriceAsDefaultProps {
  trigger?: React.ReactNode
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  price: Price.ClientRecord
}

export const priceToSetPriceAsDefaultInput = (
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
      isDefault: true,
      type: price.type,
    },
  }
}

const SetPriceAsDefault: React.FC<SetPriceAsDefaultProps> = ({
  trigger,
  isOpen,
  setIsOpen,
  price,
}) => {
  const router = useRouter()
  const editPrice = trpc.prices.update.useMutation()

  const handleMakeDefault = async () => {
    const data = priceToSetPriceAsDefaultInput(price)

    const parsed = editPriceSchema.safeParse(data)
    if (!parsed.success) {
      console.error('Invalid data:', parsed.error)
      return
    }

    await editPrice.mutateAsync(parsed.data)
    router.refresh()
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Default Price</DialogTitle>
        </DialogHeader>
        <div className="text-muted-foreground">
          <p>
            Set {price.name} to default? This will be the default
            price customers will see for this product moving forward.
          </p>
        </div>
        <DialogFooter>
          <div className="flex justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMakeDefault}
              disabled={editPrice.isPending}
            >
              Set as Default
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SetPriceAsDefault
