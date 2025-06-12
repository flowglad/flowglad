'use client'

import Modal from '@/components/ion/Modal'
import Button from '@/components/ion/Button'
import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import {
  editCatalogSchema,
  Catalog,
  EditCatalogInput,
} from '@/db/schema/catalogs'

interface SetCatalogAsDefaultProps {
  trigger?: React.ReactNode
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  catalog: Catalog.ClientRecord
}

export const catalogToSetCatalogAsDefaultInput = (
  catalog: Pick<Catalog.ClientRecord, 'id' | 'name'>
): EditCatalogInput => {
  return {
    id: catalog.id,
    catalog: {
      id: catalog.id,
      name: catalog.name,
      isDefault: true,
    },
  }
}

const SetCatalogAsDefaultModal: React.FC<
  SetCatalogAsDefaultProps
> = ({ trigger, isOpen, setIsOpen, catalog }) => {
  const router = useRouter()
  const editCatalog = trpc.catalogs.update.useMutation()

  const handleMakeDefault = async () => {
    const data = catalogToSetCatalogAsDefaultInput(catalog)

    const parsed = editCatalogSchema.safeParse(data)
    if (!parsed.success) {
      console.error('Invalid data:', parsed.error)
      return
    }

    await editCatalog.mutateAsync(parsed.data)
    router.refresh()
    setIsOpen(false)
  }

  return (
    <Modal
      trigger={trigger}
      title="Set Default Catalog"
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
            disabled={editCatalog.isPending}
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

export default SetCatalogAsDefaultModal
