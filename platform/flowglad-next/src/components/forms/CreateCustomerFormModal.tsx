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
    externalId: z.string().refine((val) => !val || !/\s/.test(val), {
      message: 'External ID cannot contain spaces',
    }),
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
    data: defaultPricingModel,
    isLoading: isLoadingPricingModel,
  } = trpc.pricingModels.getDefault.useQuery({})

  const defaultValues: CreateCustomerInputSchema = {
    customer: {
      name: '',
      email: '',
      externalId: '',
    },
  }

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
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isLoadingPricingModel ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <>
              <span>
                {defaultPricingModel?.pricingModel.name ?? 'Unknown'}
              </span>
              <span>·</span>
              <span className="text-jade-foreground">Default</span>
            </>
          )}
        </div>
        <CustomerFormFields showExternalId />
      </div>
    </FormModal>
  )
}

export default CreateCustomerFormModal
