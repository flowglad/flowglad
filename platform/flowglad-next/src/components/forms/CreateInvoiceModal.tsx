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
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { InvoiceStatus, InvoiceType } from '@/types'

function CreateInvoiceModal({
  isOpen,
  setIsOpen,
  customerProfile,
}: {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  customerProfile?: CustomerProfile.ClientRecord
}) {
  const { organization } = useAuthenticatedContext()
  const createInvoice = trpc.invoices.create.useMutation()
  if (!organization) {
    return null
  }
  const defaultValues: CreateInvoiceInput = {
    invoice: {
      invoiceDate: new Date(),
      customerProfileId: customerProfile?.id ?? '',
      currency: organization!.defaultCurrency,
      invoiceNumber: core.createInvoiceNumber(
        customerProfile?.invoiceNumberBase ?? '',
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
      <InvoiceFormFields customerProfile={customerProfile} />
    </FormModal>
  )
}

export default CreateInvoiceModal
