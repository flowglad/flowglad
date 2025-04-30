'use client'

import FormModal from '@/components/forms/FormModal'
import { sendInvoiceReminderSchema } from '@/db/schema/invoiceLineItems'
import { trpc } from '@/app/_trpc/client'
import SendReminderEmailFormFields from '@/components/forms/SendReminderEmailFormFields'

interface SendInvoiceReminderEmailModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  invoiceId: string
}

const SendInvoiceReminderEmailModal = ({
  isOpen,
  setIsOpen,
  invoiceId,
}: SendInvoiceReminderEmailModalProps) => {
  const sendReminderEmail = trpc.invoices.sendReminder.useMutation()

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Send Invoice Reminder"
      formSchema={sendInvoiceReminderSchema}
      defaultValues={{
        id: invoiceId,
        to: [],
        cc: [],
      }}
      onSubmit={async (data) => {
        await sendReminderEmail.mutateAsync(data)
      }}
    >
      <SendReminderEmailFormFields />
    </FormModal>
  )
}

export default SendInvoiceReminderEmailModal
