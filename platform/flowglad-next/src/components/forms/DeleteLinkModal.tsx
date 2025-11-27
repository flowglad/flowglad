import { trpc } from '@/app/_trpc/client'
import DeleteModal, {
  type DeleteModalWrapperProps,
} from '@/components/forms/DeleteModal'

const DeleteLinkModal: React.FC<DeleteModalWrapperProps> = (
  props
) => {
  const deleteLink = trpc.links.delete.useMutation()
  return (
    <DeleteModal
      noun="link"
      mutation={deleteLink.mutateAsync}
      {...props}
    />
  )
}

export default DeleteLinkModal
