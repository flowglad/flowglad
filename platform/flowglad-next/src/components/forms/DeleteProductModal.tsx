'use client'

import { z } from 'zod'
import FormModal from '@/components/forms/FormModal'

interface DeleteProductModalProps {
  onDelete: () => Promise<void>
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const deleteProductSchema = z.object({})

const DeleteProductModal = ({
  onDelete,
  isOpen,
  setIsOpen,
}: DeleteProductModalProps) => {
  return (
    <FormModal
      title="Delete product"
      formSchema={deleteProductSchema}
      defaultValues={() => ({})}
      onSubmit={onDelete}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
    >
      <p className="text-muted-foreground">
        {`Are you sure you want to delete this product?`}
        <br />
        <br />
        {`This can't be undone.`}
      </p>
    </FormModal>
  )
}

export default DeleteProductModal
