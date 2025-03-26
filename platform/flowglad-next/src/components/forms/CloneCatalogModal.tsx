import React from 'react'
import FormModal from '@/components/forms/FormModal'
import CloneCatalogFormFields from '@/components/forms/CloneCatalogFormFields'
import {
  cloneCatalogInputSchema,
  Catalog,
} from '@/db/schema/catalogs'
import { trpc } from '@/app/_trpc/client'

interface CloneCatalogModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  catalog: Catalog.Record
}

const CloneCatalogModal: React.FC<CloneCatalogModalProps> = ({
  isOpen,
  setIsOpen,
  catalog,
}) => {
  const cloneCatalogMutation = trpc.catalogs.clone.useMutation()

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Clone Catalog"
      formSchema={cloneCatalogInputSchema}
      defaultValues={{
        id: catalog.id,
        name: `${catalog.name} (Copy)`,
      }}
      onSubmit={cloneCatalogMutation.mutateAsync}
      submitButtonText="Clone Catalog"
    >
      <CloneCatalogFormFields />
    </FormModal>
  )
}

export default CloneCatalogModal
