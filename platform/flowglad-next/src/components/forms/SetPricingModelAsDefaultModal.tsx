'use client'

import Modal from '@/components/ion/Modal'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import {
  editPricingModelSchema,
  PricingModel,
  EditPricingModelInput,
} from '@/db/schema/pricingModels'

interface SetPricingModelAsDefaultProps {
  trigger?: React.ReactNode
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  catalog: PricingModel.ClientRecord
}

export const catalogToSetPricingModelAsDefaultInput = (
  catalog: Pick<PricingModel.ClientRecord, 'id' | 'name'>
): EditPricingModelInput => {
  return {
    id: catalog.id,
    pricingModel: {
      id: catalog.id,
      name: catalog.name,
      isDefault: true,
    },
  }
}

const SetPricingModelAsDefaultModal: React.FC<
  SetPricingModelAsDefaultProps
> = ({ trigger, isOpen, setIsOpen, catalog }) => {
  const router = useRouter()
  const editPricingModel = trpc.catalogs.update.useMutation()

  const handleMakeDefault = async () => {
    const data = catalogToSetPricingModelAsDefaultInput(catalog)

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
    <Modal
      trigger={trigger}
      title="Set Default PricingModel"
      open={isOpen}
      onOpenChange={setIsOpen}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleMakeDefault}
            disabled={editPricingModel.isPending}
          >
            Set as Default
          </Button>
        </div>
      }
      showClose
    >
      <div className="text-secondary">
        <p>
          Set {catalog.name} to default? This will be the default
          catalog for new products.
        </p>
      </div>
    </Modal>
  )
}

export default SetPricingModelAsDefaultModal
