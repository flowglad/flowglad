'use client'
import { z } from 'zod'
import { trpc } from '@/app/_trpc/client'
import CustomerFormFields, {
  customerSchema,
} from '@/components/forms/CustomerFormFields'
import FormModal from '@/components/forms/FormModal'
import { Skeleton } from '@/components/ui/skeleton'
import { type CreateCustomerInputSchema } from '@/db/tableMethods/purchaseMethods'
import core from '@/utils/core'

// UI-level schema with email validation, extended with externalId for form submission
const createCustomerFormSchema = customerSchema.extend({
  customer: customerSchema.shape.customer.extend({
    externalId: z.string(),
  }),
})

type CreateCustomerFormValues = z.infer<
  typeof createCustomerFormSchema
>

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

  const defaultValues: CreateCustomerFormValues = {
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
