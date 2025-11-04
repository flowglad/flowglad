'use client'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import InvoiceFormFields from './InvoiceFormFields'
import {
  editInvoiceSchema,
  InvoiceLineItem,
} from '@/db/schema/invoiceLineItems'
import { Invoice } from '@/db/schema/invoices'

function EditInvoiceModal({
  isOpen,
  setIsOpen,
  invoiceAndLineItems,
}: {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  invoiceAndLineItems: {
    invoice: Invoice.ClientRecord
    invoiceLineItems: InvoiceLineItem.ClientRecord[]
  }
}) {
  const updateInvoice = trpc.invoices.update.useMutation()
  const defaultValues = {
    invoice: invoiceAndLineItems.invoice,
    invoiceLineItems: invoiceAndLineItems.invoiceLineItems,
  }
  const { data: customerData } =
    trpc.customers.internal__getById.useQuery({
      id: invoiceAndLineItems.invoice.customerId,
    })
  if (!customerData) {
    return null
  }
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Invoice"
      formSchema={editInvoiceSchema}
      onSubmit={updateInvoice.mutateAsync}
      defaultValues={defaultValues}
      wide
      allowContentOverflow={false}
    >
      <InvoiceFormFields customer={customerData.customer} editMode />
    </FormModal>
  )
}

export default EditInvoiceModal
