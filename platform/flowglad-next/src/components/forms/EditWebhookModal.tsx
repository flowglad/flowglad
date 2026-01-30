'use client'

import {
  editWebhookInputSchema,
  type Webhook,
} from '@db-core/schema/webhooks'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import WebhookFormFields from '@/components/forms/WebhookFormFields'

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
      defaultValues={() => ({ id: webhook.id, webhook })}
      onSubmit={editWebhook.mutateAsync}
      allowContentOverflow={true}
    >
      <WebhookFormFields edit={true} />
    </FormModal>
  )
}

export default EditWebhookModal
