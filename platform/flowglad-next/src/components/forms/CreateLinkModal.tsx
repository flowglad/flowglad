'use client'

import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import LinkFormFields from '@/components/forms/LinkFormFields'
import { createLinkInputSchema } from '@/db/schema/links'

interface CreateLinkModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const CreateLinkModal: React.FC<CreateLinkModalProps> = ({
  isOpen,
  setIsOpen,
}) => {
  const createLink = trpc.links.create.useMutation()

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Link"
      formSchema={createLinkInputSchema}
      onSubmit={createLink.mutateAsync}
      defaultValues={{
        link: {
          name: '',
          url: '',
        },
      }}
    >
      <LinkFormFields />
    </FormModal>
  )
}

export default CreateLinkModal
