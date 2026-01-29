'use client'

import {
  type EditProductInput,
  editProductSchema,
} from '@db-core/schema/prices'
import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface ArchiveProductModalProps {
  trigger?: React.ReactNode
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  product: {
    id: string
    active: boolean
    name: string
  }
}

const ArchiveProductModal: React.FC<ArchiveProductModalProps> = ({
  trigger,
  isOpen,
  setIsOpen,
  product,
}) => {
  const router = useRouter()
  const editProduct = trpc.products.update.useMutation()

  const handleArchive = async () => {
    const data: EditProductInput = {
      product: {
        id: product.id,
        active: !product.active,
        name: product.name,
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {product.active
              ? 'Deactivate product'
              : 'Activate product'}
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
              disabled={editProduct.isPending}
            >
              {product.active
                ? 'Deactivate product'
                : 'Activate product'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ArchiveProductModal
