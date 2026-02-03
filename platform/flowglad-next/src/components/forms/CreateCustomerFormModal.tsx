'use client'
import { z } from 'zod'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import { Skeleton } from '@/components/ui/skeleton'
import { type CreateCustomerInputSchema } from '@/db/tableMethods/purchaseMethods'
import core from '@/utils/core'
import CustomerFormFields from './CustomerFormFields'

/**
 * Form validation schema for creating a customer.
 * Provides user-friendly validation messages.
 * Note: externalId is a string (can be empty) - if empty, one is generated on submit.
 */
const createCustomerFormSchema = z.object({
  customer: z.object({
    name: z.string().min(2, 'Please enter the customer name'),
    email: z.string().email('Please enter a valid email address'),
    externalId: z.string(),
  }),
})

const CreateCustomerFormModal = ({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) => {
  const createCustomer = trpc.customers.create.useMutation()
  const {
    data: focusedMembership,
    isLoading: isLoadingPricingModel,
  } = trpc.organizations.getFocusedMembership.useQuery()

  const getDefaultValues = (): CreateCustomerInputSchema => ({
    customer: {
      name: '',
      email: '',
      externalId: '',
    },
  })

  const handleSubmit = async (data: CreateCustomerInputSchema) => {
    const customerData = {
      ...data,
      customer: {
        ...data.customer,
        externalId: data.customer.externalId || core.nanoid(),
      },
    }
    return createCustomer.mutateAsync(customerData)
  }

  return (
    <FormModal
      title="Create Customer"
      formSchema={createCustomerFormSchema}
      defaultValues={getDefaultValues}
      onSubmit={handleSubmit}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
    >
      <div className="flex flex-col gap-4">
        <div className="text-xs text-muted-foreground">
          {isLoadingPricingModel ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <span>
              Pricing Model:{' '}
              {focusedMembership?.pricingModel.name ?? 'Unknown'}
            </span>
          )}
        </div>
        <CustomerFormFields showExternalId />
      </div>
    </FormModal>
  )
}

export default CreateCustomerFormModal
