'use client'

import Modal from '@/components/ion/Modal'
import Button from '@/components/ion/Button'
import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import { editPriceSchema, Price } from '@/db/schema/prices'

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
  const editPrice = trpc.prices.edit.useMutation()

  const handleMakeDefault = async () => {
    const data = {
      price: {
        id: price.id,
        productId: price.productId,
        isDefault: true,
      },
    }

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
    <Modal
      trigger={trigger}
      title="Set Default Price"
      open={isOpen}
      onOpenChange={setIsOpen}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button
            variant="outline"
            color="neutral"
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
      }
      showClose
    >
      <div className="text-secondary">
        <p>
          Set {price.name} to default? This will be the default price
          customers will see for this product moving forward.
        </p>
      </div>
    </Modal>
  )
}

export default SetPriceAsDefault
