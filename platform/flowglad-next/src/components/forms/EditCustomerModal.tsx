'use client'

import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import {
  type Customer,
  editCustomerInputSchema,
} from '@/db/schema/customers'
import CustomerFormFields from './CustomerFormFields'

interface EditCustomerModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  customer: Customer.ClientRecord
}

const EditCustomerModal = ({
  isOpen,
  setIsOpen,
  customer,
}: EditCustomerModalProps) => {
  const editCustomer = trpc.customers.update.useMutation()

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Customer"
      formSchema={editCustomerInputSchema}
      defaultValues={() => ({
        externalId: customer.externalId,
        customer: {
          ...customer,
        },
      })}
      onSubmit={async (data) => {
        await editCustomer.mutateAsync(data)
      }}
    >
      <CustomerFormFields />
    </FormModal>
  )
}

export default EditCustomerModal
