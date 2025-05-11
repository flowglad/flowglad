'use client'

import FormModal from '@/components/forms/FormModal'
import {
  createWebhookInputSchema,
  Webhook,
} from '@/db/schema/webhooks'
import WebhookFormFields from '@/components/forms/WebhookFormFields'
import { trpc } from '@/app/_trpc/client'

interface CreateWebhookModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const CreateWebhookModal: React.FC<CreateWebhookModalProps> = ({
  isOpen,
  setIsOpen,
}) => {
  const createWebhook = trpc.webhooks.create.useMutation()
  const webhookDefaultValues: Webhook.ClientInsert = {
    name: '',
    url: '',
    filterTypes: [],
  }
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Webhook"
      formSchema={createWebhookInputSchema}
      onSubmit={createWebhook.mutateAsync}
      defaultValues={{
        webhook: webhookDefaultValues,
      }}
    >
      <WebhookFormFields />
    </FormModal>
  )
}

export default CreateWebhookModal
