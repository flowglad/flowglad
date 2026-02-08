'use client'

import {
  type EditProductInput,
  editProductSchema,
} from '@db-core/schema/prices'
import { Loader2 } from 'lucide-react'
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
  onSuccess?: () => void
}

const ArchiveProductModal: React.FC<ArchiveProductModalProps> = ({
  trigger,
  isOpen,
  setIsOpen,
  product,
  onSuccess,
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
    onSuccess?.()
  }

  const isArchiving = product.active

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isArchiving ? 'Archive product' : 'Restore product'}
          </DialogTitle>
          <DialogDescription>
            {isArchiving ? (
              <>
                Are you sure you want to archive{' '}
                <span className="font-medium">{product.name}</span>?
              </>
            ) : (
              <>
                Are you sure you want to restore{' '}
                <span className="font-medium">{product.name}</span>?
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isArchiving ? (
            <>
              <p className="text-sm text-muted-foreground">
                Archiving a product will:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>Hide it from new purchases</li>
                <li>Hide it from the active products list</li>
                <li>Existing subscriptions will not be affected</li>
              </ul>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Restoring a product will:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>Make it available for new purchases</li>
                <li>Show it in the active products list</li>
              </ul>
            </>
          )}
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
              variant={isArchiving ? 'destructive' : 'default'}
              onClick={handleArchive}
              disabled={editProduct.isPending}
            >
              {editProduct.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {isArchiving ? 'Archiving...' : 'Restoring...'}
                </>
              ) : isArchiving ? (
                'Archive product'
              ) : (
                'Restore product'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ArchiveProductModal
