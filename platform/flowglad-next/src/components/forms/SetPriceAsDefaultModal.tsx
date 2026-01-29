'use client'

<<<<<<< HEAD
import { PriceType } from '@db-core/enums'
||||||| parent of b097e5ae (Delete original src/db schema utils and update all imports to @db-core)
=======
>>>>>>> b097e5ae (Delete original src/db schema utils and update all imports to @db-core)
import { idInputSchema } from '@db-core/tableUtils'
import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  EditPriceInput,
  editPriceSchema,
  type Price,
} from '@/db/schema/prices'
<<<<<<< HEAD
||||||| parent of b097e5ae (Delete original src/db schema utils and update all imports to @db-core)
import { idInputSchema } from '@/db/tableUtils'
import { PriceType } from '@/types'
=======
import { PriceType } from '@/types'
>>>>>>> b097e5ae (Delete original src/db schema utils and update all imports to @db-core)

interface SetPriceAsDefaultProps {
  trigger?: React.ReactNode
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  price: Price.ClientRecord
}

const SetPriceAsDefault: React.FC<SetPriceAsDefaultProps> = ({
  trigger,
  isOpen,
  setIsOpen,
  price,
}) => {
  const router = useRouter()
  const setPriceAsDefault = trpc.prices.setAsDefault.useMutation()

  const handleMakeDefault = async () => {
    const data = {
      id: price.id,
    }

    const parsed = idInputSchema.safeParse(data)
    if (!parsed.success) {
      console.error('Invalid data:', parsed.error)
      return
    }

    await setPriceAsDefault.mutateAsync(parsed.data)
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
              disabled={setPriceAsDefault.isPending}
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
