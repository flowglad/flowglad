'use client'

import FormModal from '@/components/forms/FormModal'
import { Catalog, editCatalogSchema } from '@/db/schema/catalogs'
import CatalogFormFields from '@/components/forms/CatalogFormFields'
import { trpc } from '@/app/_trpc/client'

interface EditCatalogModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  catalog: Catalog.ClientRecord
}

const EditCatalogModal: React.FC<EditCatalogModalProps> = ({
  isOpen,
  setIsOpen,
  catalog,
}) => {
  const editCatalog = trpc.catalogs.update.useMutation()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Catalog"
      formSchema={editCatalogSchema}
      defaultValues={{ catalog }}
      onSubmit={editCatalog.mutateAsync}
    >
      <CatalogFormFields />
    </FormModal>
  )
}

export default EditCatalogModal
