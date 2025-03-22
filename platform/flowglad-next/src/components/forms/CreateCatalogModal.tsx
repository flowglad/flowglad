'use client'

import FormModal from '@/components/forms/FormModal'
import { createCatalogSchema } from '@/db/schema/catalogs'
import CatalogFormFields from '@/components/forms/CatalogFormFields'
import { trpc } from '@/app/_trpc/client'

interface CreateCatalogModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const CreateCatalogModal: React.FC<CreateCatalogModalProps> = ({
  isOpen,
  setIsOpen,
}) => {
  const createCatalog = trpc.createCatalog.useMutation()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Catalog"
      formSchema={createCatalogSchema}
      defaultValues={{ catalog: { name: '' } }}
      onSubmit={createCatalog.mutateAsync}
    >
      <CatalogFormFields />
    </FormModal>
  )
}

export default CreateCatalogModal
