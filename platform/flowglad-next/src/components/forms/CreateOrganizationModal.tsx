'use client'

import {
  type CreateOrganizationInput,
  createOrganizationSchema,
} from '@db-core/schema/organizations'
import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import OrganizationFormFields from '@/components/forms/OrganizationFormFields'
import { useAuthContext } from '@/contexts/authContext'

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

  const getDefaultValues = (): CreateOrganizationInput => ({
    organization: {
      name: '',
      countryId: '',
    },
  })

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Organization"
      formSchema={createOrganizationSchema}
      defaultValues={getDefaultValues}
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
      {/* FIXME (FG-555): Readd OrganizationLogoInput to this page once we have a way to upload the logo during organization creation */}
      <OrganizationFormFields />
    </FormModal>
  )
}

export default CreateOrganizationModal
