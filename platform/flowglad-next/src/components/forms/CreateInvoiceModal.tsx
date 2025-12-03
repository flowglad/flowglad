'use client'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import { useAuthenticatedContext } from '@/contexts/authContext'
import type { Customer } from '@/db/schema/customers'
import {
  type CreateInvoiceInput,
  createInvoiceSchema,
} from '@/db/schema/invoiceLineItems'
import type { Organization } from '@/db/schema/organizations'
import {
  InvoiceStatus,
  InvoiceType,
  SubscriptionItemType,
} from '@/types'
import core from '@/utils/core'
import InvoiceFormFields from './InvoiceFormFields'

export const constructInvoiceDefaultValues = (
  organization: Organization.ClientRecord,
  customer?: Customer.ClientRecord
) => {
  const defaultValues: CreateInvoiceInput = {
    invoice: {
      invoiceDate: Date.now(),
      customerId: customer?.id ?? '',
      currency: organization!.defaultCurrency,
      invoiceNumber: core.createInvoiceNumber(
        customer?.invoiceNumberBase ?? '',
        1
      ),
      dueDate: Date.now(),
      status: InvoiceStatus.Open,
      type: InvoiceType.Standalone,
      purchaseId: null,
      billingPeriodId: null,
      subscriptionId: null,
    },
    invoiceLineItems: [
      {
        description: '',
        quantity: 1,
        price: 0,
        priceId: null,
        type: SubscriptionItemType.Static,
      },
    ],
  }
  return defaultValues
}

function CreateInvoiceModal({
  isOpen,
  setIsOpen,
  customer,
}: {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  customer?: Customer.ClientRecord
}) {
  const { organization } = useAuthenticatedContext()
  const createInvoice = trpc.invoices.create.useMutation()
  if (!organization) {
    return null
  }
  const defaultValues = constructInvoiceDefaultValues(
    organization,
    customer
  )
  return (
    <FormModal<CreateInvoiceInput>
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Invoice"
      formSchema={createInvoiceSchema}
      onSubmit={createInvoice.mutateAsync}
      defaultValues={defaultValues}
      wide
      allowContentOverflow={false}
    >
      <InvoiceFormFields customer={customer} />
    </FormModal>
  )
}

export default CreateInvoiceModal
