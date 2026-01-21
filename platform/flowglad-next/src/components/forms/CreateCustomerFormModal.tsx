'use client'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import { Skeleton } from '@/components/ui/skeleton'
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
      formSchema={createCustomerInputSchema}
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
