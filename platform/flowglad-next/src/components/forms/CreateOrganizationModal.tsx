'use client'

import FormModal from '@/components/forms/FormModal'
import { trpc } from '@/app/_trpc/client'
import {
  createOrganizationSchema,
  type CreateOrganizationInput,
} from '@/db/schema/organizations'
import OrganizationFormFields from '@/components/forms/OrganizationFormFields'
import { useAuthContext } from '@/contexts/authContext'
import { useRouter } from 'next/navigation'

interface CreateOrganizationModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const CreateOrganizationModal: React.FC<
  CreateOrganizationModalProps
> = ({ isOpen, setIsOpen }) => {
  const createOrganization = trpc.organizations.create.useMutation()
  const { setOrganization } = useAuthContext()
  const router = useRouter()
  const trpcContext = trpc.useContext()

  const defaultValues: CreateOrganizationInput = {
    organization: {
      name: '',
      countryId: '',
    },
  }

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Organization"
      formSchema={createOrganizationSchema}
      defaultValues={defaultValues}
      onSubmit={async (data) => {
        const { organization } =
          await createOrganization.mutateAsync(data)
        setOrganization(organization)

        // Invalidate queries to refresh the organization list
        await trpcContext.organizations.getOrganizations.invalidate()
        await trpcContext.organizations.getFocusedMembership.invalidate()
      }}
      submitButtonText="Create Organization"
    >
      <OrganizationFormFields />
    </FormModal>
  )
}

export default CreateOrganizationModal
