'use client'

import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import LinkFormFields from '@/components/forms/LinkFormFields'
import { editLinkInputSchema, type Link } from '@/db/schema/links'

interface EditLinkModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  link: Link.ClientRecord
}

const EditLinkModal: React.FC<EditLinkModalProps> = ({
  isOpen,
  setIsOpen,
  link,
}) => {
  const editLink = trpc.links.update.useMutation()

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Link"
      formSchema={editLinkInputSchema}
      defaultValues={{ link }}
      onSubmit={editLink.mutateAsync}
    >
      <LinkFormFields />
    </FormModal>
  )
}

export default EditLinkModal
