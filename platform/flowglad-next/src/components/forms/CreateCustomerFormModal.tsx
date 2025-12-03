'use client'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import {
  type CreateCustomerInputSchema,
  createCustomerInputSchema,
} from '@/db/tableMethods/purchaseMethods'
import core from '@/utils/core'
import CustomerFormFields from './CustomerFormFields'

const CreateCustomerFormModal = ({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) => {
  const createCustomer = trpc.customers.create.useMutation()

  const defaultValues: CreateCustomerInputSchema = {
    customer: {
      name: '',
      email: '',
      externalId: core.nanoid(),
    },
  }

  return (
    <FormModal
      title="Create Customer"
      formSchema={createCustomerInputSchema}
      defaultValues={defaultValues}
      onSubmit={createCustomer.mutateAsync}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
    >
      <div className="flex flex-col gap-6">
        <CustomerFormFields />
      </div>
    </FormModal>
  )
}

export default CreateCustomerFormModal
