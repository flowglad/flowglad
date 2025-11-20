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
import { toast } from 'sonner'

interface CreateWebhookModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const CreateWebhookModal: React.FC<CreateWebhookModalProps> = ({
  isOpen,
  setIsOpen,
}) => {
  const [webhookSecret, setWebhookSecret] = useState<string | null>(
    null
  )
  const createWebhook = trpc.webhooks.create.useMutation({
    onSuccess: (result) => {
      setWebhookSecret(result.secret)
      toast.success('Webhook created successfully')
    },
    onError: (error) => {
      toast.error(
        'Failed to create webhook. Please check your settings and try again.'
      )
      console.error('Webhook creation error:', error)
    },
  })
  const webhookDefaultValues: Webhook.ClientInsert = {
    name: '',
    url: '',
    filterTypes: [],
    active: true,
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
        await createWebhook.mutateAsync(data)
      }}
      hideFooter={webhookSecret ? true : false}
      autoClose={false}
      allowContentOverflow={true}
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
