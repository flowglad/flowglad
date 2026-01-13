'use client'
import { z } from 'zod'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import core from '@/utils/core'
import CustomerFormFields, { customerSchema } from './CustomerFormFields'

// UI-level schema with email validation, extended with externalId for form submission
const createCustomerFormSchema = customerSchema.extend({
  customer: customerSchema.shape.customer.extend({
    externalId: z.string(),
  }),
})

type CreateCustomerFormValues = z.infer<typeof createCustomerFormSchema>

const CreateCustomerFormModal = ({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) => {
  const createCustomer = trpc.customers.create.useMutation()

  const defaultValues: CreateCustomerFormValues = {
    customer: {
      name: '',
      email: '',
      externalId: core.nanoid(),
    },
  }

  return (
    <FormModal
      title="Create Customer"
      formSchema={createCustomerFormSchema}
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
