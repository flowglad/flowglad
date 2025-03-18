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
import { InvoiceStatus, InvoiceType } from '@/types'

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
  const defaultValues: CreateInvoiceInput = {
    invoice: {
      invoiceDate: new Date(),
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
    },
    invoiceLineItems: [
      {
        description: '',
        quantity: 1,
        price: 0,
        priceId: null,
        invoiceId: '',
      },
    ],
  }

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
