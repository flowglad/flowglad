import { trpc } from '@/app/_trpc/client'
import DeleteModal, {
  type DeleteModalWrapperProps,
} from '@/components/forms/DeleteModal'

const DeleteDiscountModal: React.FC<DeleteModalWrapperProps> = (
  props
) => {
  const deleteDiscount = trpc.discounts.delete.useMutation()
  return (
    <DeleteModal
      noun="Discount"
      mutation={deleteDiscount.mutateAsync}
      {...props}
    />
  )
}

export default DeleteDiscountModal
