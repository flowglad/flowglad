import { trpc } from '@/app/_trpc/client'
import DeleteModal, {
  type DeleteModalWrapperProps,
} from '@/components/forms/DeleteModal'

const DeleteApiKeyModal: React.FC<DeleteModalWrapperProps> = (
  props
) => {
  const deleteApiKey = trpc.apiKeys.delete.useMutation()
  return (
    <DeleteModal
      noun="API Key"
      mutation={deleteApiKey.mutateAsync}
      {...props}
    />
  )
}

export default DeleteApiKeyModal
