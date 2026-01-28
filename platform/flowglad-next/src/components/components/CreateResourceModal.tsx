'use client'

import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import ResourceFormFields from '@/components/forms/ResourceFormFields'
import { createResourceSchema } from '@/db/schema/resources'

interface CreateResourceModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  defaultPricingModelId?: string
  hidePricingModelSelect?: boolean
}

const CreateResourceModal: React.FC<CreateResourceModalProps> = ({
  isOpen,
  setIsOpen,
  defaultPricingModelId,
  hidePricingModelSelect,
}) => {
  const trpcContext = trpc.useContext()
  const createResource = trpc.resources.create.useMutation({
    onSuccess: () => {
      toast.success('Resource created successfully')
      trpcContext.resources.list.invalidate()
      trpcContext.resources.getTableRows.invalidate()
    },
    onError: () => {
      toast.error('Failed to create resource')
    },
  })

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Resource"
      formSchema={createResourceSchema}
      defaultValues={() => ({
        resource: {
          name: '',
          slug: '',
          pricingModelId: defaultPricingModelId || '',
          active: true,
        },
      })}
      onSubmit={async (input) => {
        await createResource.mutateAsync(input)
      }}
      allowContentOverflow={true}
    >
      <ResourceFormFields
        hidePricingModelSelect={hidePricingModelSelect}
      />
    </FormModal>
  )
}

export default CreateResourceModal
