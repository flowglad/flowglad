'use client'

import FormModal from '@/components/forms/FormModal'
import { trpc } from '@/app/_trpc/client'
import {
  EditProductInput,
  editProductSchema,
} from '@/db/schema/prices'
import { Product } from '@/db/schema/products'
import { ZodType } from 'zod'

interface ArchiveProductModalProps {
  trigger?: React.ReactNode
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  product: Product.ClientRecord
}

const ArchiveProductModal: React.FC<ArchiveProductModalProps> = ({
  isOpen,
  setIsOpen,
  product,
}) => {
  const editProduct = trpc.products.edit.useMutation()

  const handleSubmit = async (data: EditProductInput) => {
    await editProduct.mutateAsync(data)
  }

  const modalText = product.active ? (
    <div className="text-secondary gap-4">
      <p>Archiving will hide this product from new purchases.</p>
      <p>Are you sure you want to archive this product?</p>
    </div>
  ) : (
    <div className="text-secondary gap-4">
      <p className="text-secondary pb-4">
        Unarchiving will make this product available for new
        purchases.
      </p>
      <p className="text-secondary pb-4">
        Are you sure you want to unarchive this product?
      </p>
    </div>
  )

  return (
    <FormModal<EditProductInput>
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title={product.active ? 'Archive product' : 'Unarchive product'}
      formSchema={editProductSchema as ZodType<EditProductInput>}
      defaultValues={{
        product,
      }}
      onSubmit={handleSubmit}
    >
      {modalText}
    </FormModal>
  )
}

export default ArchiveProductModal
