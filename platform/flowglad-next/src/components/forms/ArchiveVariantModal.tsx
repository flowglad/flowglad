'use client'

import Modal from '@/components/ion/Modal'
import Button from '@/components/ion/Button'
import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import { editVariantSchema } from '@/db/schema/variants'

interface ArchiveVariantModalProps {
  trigger?: React.ReactNode
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  variant: {
    id: string
    productId: string
    active: boolean
  }
}

const ArchiveVariantModal: React.FC<ArchiveVariantModalProps> = ({
  trigger,
  isOpen,
  setIsOpen,
  variant,
}) => {
  const router = useRouter()
  const editVariant = trpc.variants.edit.useMutation()

  const handleArchive = async () => {
    const data = {
      variant: {
        id: variant.id,
        productId: variant.productId,
        active: !variant.active,
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

  const modalText = variant.active ? (
    <div className="text-secondary gap-4">
      <p>Archiving will hide this variant from new purchases.</p>
      <p>Are you sure you want to archive this variant?</p>
    </div>
  ) : (
    <div className="text-secondary gap-4">
      <p className="text-secondary pb-4">
        Unarchiving will make this variant available for new
        purchases.
      </p>
      <p className="text-secondary pb-4">
        Are you sure you want to unarchive this variant?
      </p>
    </div>
  )

  return (
    <Modal
      trigger={trigger}
      title={variant.active ? 'Archive variant' : 'Unarchive variant'}
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
            onClick={handleArchive}
            disabled={editVariant.isPending}
          >
            {variant.active ? 'Archive variant' : 'Unarchive variant'}
          </Button>
        </div>
      }
      showClose
    >
      {modalText}
    </Modal>
  )
}

export default ArchiveVariantModal
