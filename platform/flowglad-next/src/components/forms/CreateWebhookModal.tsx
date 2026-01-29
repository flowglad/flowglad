'use client'

import {
  createWebhookInputSchema,
  type Webhook,
} from '@db-core/schema/webhooks'
import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import FormModal from '@/components/forms/FormModal'
import WebhookFormFields from '@/components/forms/WebhookFormFields'

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
      const errorMessage =
        error.message || 'Failed to create webhook. Please try again.'
      toast.error(errorMessage)
      console.error('Webhook creation error:', error)
    },
  })
  const getDefaultValues = () => {
    const webhookDefaultValues: Webhook.ClientInsert = {
      name: '',
      url: '',
      filterTypes: [],
      active: true,
      pricingModelId: '',
    }
    return {
      webhook: webhookDefaultValues,
    }
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
      defaultValues={getDefaultValues}
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
