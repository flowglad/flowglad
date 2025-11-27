import { trpc } from '@/app/_trpc/client'
import DeleteModal, {
  type DeleteModalWrapperProps,
} from '@/components/forms/DeleteModal'

const DeleteFileModal: React.FC<DeleteModalWrapperProps> = (
  props
) => {
  const deleteFile = trpc.files.delete.useMutation()
  return (
    <DeleteModal
      noun="link"
      mutation={deleteFile.mutateAsync}
      {...props}
    />
  )
}

export default DeleteFileModal
