'use client'

import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import ResourceFormFields from '@/components/forms/ResourceFormFields'
import {
  editResourceSchema,
  type Resource,
} from '@/db/schema/resources'

interface EditResourceModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  resource: Resource.ClientRecord
}

const EditResourceModal: React.FC<EditResourceModalProps> = ({
  isOpen,
  setIsOpen,
  resource,
}) => {
  const trpcContext = trpc.useContext()
  const editResource = trpc.resources.update.useMutation({
    onSuccess: () => {
      toast.success('Resource updated successfully')
      trpcContext.resources.list.invalidate()
      trpcContext.resources.getTableRows.invalidate()
    },
    onError: () => {
      toast.error('Failed to update resource')
    },
  })

  // Explicitly exclude create-only and read-only fields from defaultValues
  const {
    pricingModelId,
    organizationId,
    livemode,
    ...editableFields
  } = resource

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Resource"
      formSchema={editResourceSchema}
      defaultValues={() => ({
        id: resource.id,
        resource: editableFields,
      })}
      onSubmit={async (input) => {
        await editResource.mutateAsync(input)
      }}
      allowContentOverflow={true}
    >
      <ResourceFormFields edit={true} />
    </FormModal>
  )
}

export default EditResourceModal
