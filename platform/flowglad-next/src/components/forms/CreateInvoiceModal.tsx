'use client'
import core from '@/utils/core'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import InvoiceFormFields from './InvoiceFormFields'
import {
  CreateInvoiceInput,
  createInvoiceSchema,
} from '@/db/schema/invoiceLineItems'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { Customer } from '@/db/schema/customers'
import {
  InvoiceStatus,
  InvoiceType,
  SubscriptionItemType,
} from '@/types'
import { Organization } from '@/db/schema/organizations'

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
    >
      <InvoiceFormFields customer={customer} />
    </FormModal>
  )
}

export default CreateInvoiceModal
