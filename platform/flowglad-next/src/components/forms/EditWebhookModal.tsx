'use client'

import FormModal from '@/components/forms/FormModal'
import { Webhook, editWebhookInputSchema } from '@/db/schema/webhooks'
import WebhookFormFields from '@/components/forms/WebhookFormFields'
import { trpc } from '@/app/_trpc/client'

interface EditWebhookModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  webhook: Webhook.ClientRecord
}

const EditWebhookModal: React.FC<EditWebhookModalProps> = ({
  isOpen,
  setIsOpen,
  webhook,
}) => {
  const editWebhook = trpc.webhooks.update.useMutation()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Webhook"
      formSchema={editWebhookInputSchema}
      defaultValues={{ webhook }}
      onSubmit={editWebhook.mutateAsync}
    >
      <WebhookFormFields />
    </FormModal>
  )
}

export default EditWebhookModal
