'use client'

import Modal from '@/components/ion/Modal'
import Button from '@/components/ion/Button'
import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import { editVariantSchema, Variant } from '@/db/schema/variants'

interface SetVariantAsDefaultProps {
  trigger?: React.ReactNode
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  variant: Variant.Record
}

const SetVariantAsDefault: React.FC<SetVariantAsDefaultProps> = ({
  trigger,
  isOpen,
  setIsOpen,
  variant,
}) => {
  const router = useRouter()
  const editVariant = trpc.variants.edit.useMutation()

  const handleMakeDefault = async () => {
    const data = {
      variant: {
        id: variant.id,
        productId: variant.productId,
        isDefault: true,
      },
    }

    const parsed = editVariantSchema.safeParse(data)
    if (!parsed.success) {
      console.error('Invalid data:', parsed.error)
      return
    }

    await editVariant.mutateAsync(parsed.data)
    router.refresh()
    setIsOpen(false)
  }

  return (
    <Modal
      trigger={trigger}
      title="Set Default Variant"
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
            disabled={editVariant.isPending}
          >
            Set as Default
          </Button>
        </div>
      }
      showClose
    >
      <div className="text-secondary">
        <p>
          Set {variant.name} to default? This will be the default
          price customers will see for this product moving forward.
        </p>
      </div>
    </Modal>
  )
}

export default SetVariantAsDefault
