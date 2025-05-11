'use client'

import { useState } from 'react'
import FormModal from '@/components/forms/FormModal'
import {
  createWebhookInputSchema,
  Webhook,
} from '@/db/schema/webhooks'
import WebhookFormFields from '@/components/forms/WebhookFormFields'
import { trpc } from '@/app/_trpc/client'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'

interface CreateWebhookModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const CreateWebhookModal: React.FC<CreateWebhookModalProps> = ({
  isOpen,
  setIsOpen,
}) => {
  const createWebhook = trpc.webhooks.create.useMutation()
  const [webhookSecret, setWebhookSecret] = useState<string | null>(
    null
  )
  const { invalidate } = trpc.useUtils()

  const webhookDefaultValues: Webhook.ClientInsert = {
    name: '',
    url: '',
    filterTypes: [],
  }

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={(newIsOpen) => {
        setIsOpen(newIsOpen)
        setWebhookSecret(null)
      }}
      title="Create Webhook"
      formSchema={createWebhookInputSchema}
      defaultValues={{
        webhook: webhookDefaultValues,
      }}
      onSubmit={async (data) => {
        const result = await createWebhook.mutateAsync(data)
        setWebhookSecret(result.secret)
      }}
      hideFooter={webhookSecret ? true : false}
      autoClose={false}
    >
      {webhookSecret ? (
        <div className="flex flex-col gap-4">
          <CopyableTextTableCell copyText={webhookSecret}>
            {webhookSecret}
          </CopyableTextTableCell>
          <p className="text-sm text-foreground">
            Copy this webhook secret and save it in your environment
            variables.
          </p>
        </div>
      ) : (
        <WebhookFormFields />
      )}
    </FormModal>
  )
}

export default CreateWebhookModal
