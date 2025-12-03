'use client'

import { trpc } from '@/app/_trpc/client'
import { FileFormFields } from '@/components/forms/FileFormFields'
import FormModal from '@/components/forms/FormModal'
import { editFileInputSchema, type File } from '@/db/schema/files'

interface CreatePostPurchaseFileModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  file: File.ClientRecord
}

const CreatePostPurchaseFileModal: React.FC<
  CreatePostPurchaseFileModalProps
> = ({ isOpen, setIsOpen, file }) => {
  const editFile = trpc.files.update.useMutation()

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Post-Purchase File"
      formSchema={editFileInputSchema}
      defaultValues={{ file }}
      onSubmit={editFile.mutateAsync}
    >
      <FileFormFields />
    </FormModal>
  )
}

export default CreatePostPurchaseFileModal
