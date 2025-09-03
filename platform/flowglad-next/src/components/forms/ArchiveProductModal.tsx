'use client'

import Modal from '@/components/ion/Modal'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import {
  EditProductInput,
  editProductSchema,
} from '@/db/schema/prices'

interface ArchiveProductModalProps {
  trigger?: React.ReactNode
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  product: {
    id: string
    active: boolean
  }
}

const ArchiveProductModal: React.FC<ArchiveProductModalProps> = ({
  trigger,
  isOpen,
  setIsOpen,
  product,
}) => {
  const router = useRouter()
  const editProduct = trpc.products.edit.useMutation()

  const handleArchive = async () => {
    const data: EditProductInput = {
      product: {
        id: product.id,
        active: !product.active,
      },
      id: product.id,
    }

    const parsed = editProductSchema.safeParse(data)
    if (!parsed.success) {
      console.error('Invalid data:', parsed.error)
      return
    }

    await editProduct.mutateAsync(parsed.data)
    router.refresh()
    setIsOpen(false)
  }

  const modalText = product.active ? (
    <div className="text-muted-foreground gap-4">
      <p>Deactivating will hide this product from new purchases.</p>
      <p>Are you sure you want to deactivate this product?</p>
    </div>
  ) : (
    <div className="text-muted-foreground gap-4">
      <p className="text-muted-foreground pb-4">
        Activating will make this product available for new purchases.
      </p>
      <p className="text-muted-foreground pb-4">
        Are you sure you want to activate this product?
      </p>
    </div>
  )

  return (
    <Modal
      trigger={trigger}
      title={
        product.active ? 'Deactivate product' : 'Activate product'
      }
      open={isOpen}
      onOpenChange={setIsOpen}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleArchive}
            disabled={editProduct.isPending}
          >
            {product.active
              ? 'Deactivate product'
              : 'Activate product'}
          </Button>
        </div>
      }
      showClose
    >
      {modalText}
    </Modal>
  )
}

export default ArchiveProductModal
