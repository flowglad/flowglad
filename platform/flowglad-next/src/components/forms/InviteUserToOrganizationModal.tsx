import React from 'react'
import FormModal from '@/components/forms/FormModal'
import InviteUserToOrganizationFormFields from '@/components/forms/InviteUserToOrganizationFormFields'
import { inviteUserToOrganizationSchema } from '@/db/schema/memberships'
import { trpc } from '@/app/_trpc/client'

interface InviteUserToOrganizationModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const InviteUserToOrganizationModal: React.FC<
  InviteUserToOrganizationModalProps
> = ({ isOpen, setIsOpen }) => {
  const inviteUserMutation =
    trpc.organizations.inviteUser.useMutation()
  const trpcContext = trpc.useContext()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Invite User to Organization"
      formSchema={inviteUserToOrganizationSchema}
      defaultValues={{
        email: '',
        name: '',
      }}
      onSubmit={inviteUserMutation.mutateAsync}
      onSuccess={() => {
        trpcContext.organizations.getMembers.invalidate()
      }}
      submitButtonText="Invite User"
    >
      <InviteUserToOrganizationFormFields />
    </FormModal>
  )
}

export default InviteUserToOrganizationModal
