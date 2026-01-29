'use client'

import {
  type EditPricingModelInput,
  editPricingModelSchema,
  type PricingModel,
} from '@db-core/schema/pricingModels'
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

interface SetPricingModelAsDefaultProps {
  trigger?: React.ReactNode
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  pricingModel: PricingModel.ClientRecord
}

export const pricingModelToSetPricingModelAsDefaultInput = (
  pricingModel: Pick<PricingModel.ClientRecord, 'id' | 'name'>
): EditPricingModelInput => {
  return {
    id: pricingModel.id,
    pricingModel: {
      id: pricingModel.id,
      name: pricingModel.name,
      isDefault: true,
    },
  }
}

const SetPricingModelAsDefaultModal: React.FC<
  SetPricingModelAsDefaultProps
> = ({ trigger, isOpen, setIsOpen, pricingModel }) => {
  const router = useRouter()
  const editPricingModel = trpc.pricingModels.update.useMutation()

  const handleMakeDefault = async () => {
    const data =
      pricingModelToSetPricingModelAsDefaultInput(pricingModel)

    const parsed = editPricingModelSchema.safeParse(data)
    if (!parsed.success) {
      console.error('Invalid data:', parsed.error)
      return
    }

    await editPricingModel.mutateAsync(parsed.data)
    router.refresh()
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Default Pricing Model</DialogTitle>
        </DialogHeader>
        <div className="text-muted-foreground">
          <p>
            Set {pricingModel.name} to default? This will be the
            default pricing model for new products.
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
              disabled={editPricingModel.isPending}
            >
              Set as Default
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SetPricingModelAsDefaultModal
