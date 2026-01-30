'use client'
import { FlowgladApiKeyType } from '@db-core/enums'
import { createApiKeyInputSchema } from '@db-core/schema/apiKeys'
import { Copy } from 'lucide-react'
import { useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import ApiKeyFormFields from '@/components/forms/ApiKeyFormFields'
import FormModal from '@/components/forms/FormModal'
import { Input } from '@/components/ui/input'

interface CreateApiKeyModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const CreateApiKeyModal = ({
  isOpen,
  setIsOpen,
}: CreateApiKeyModalProps) => {
  const createApiKey = trpc.apiKeys.create.useMutation()
  // Get focused membership to auto-set pricingModelId
  const focusedMembership =
    trpc.organizations.getFocusedMembership.useQuery()
  const focusedPricingModelId =
    focusedMembership.data?.pricingModel?.id ?? ''

  /**
   * Used to determine if the key is in livemode
   */
  const [livemode, setLivemode] = useState(false)
  const [rawApiKey, setRawApiKey] = useState<string | null>(null)
  const copyTextHandler = useCopyTextHandler({
    text: rawApiKey ?? '',
  })
  const trpcContext = trpc.useContext()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={(newIsOpen) => {
        setIsOpen(newIsOpen)
        setRawApiKey(null)
      }}
      title="Create API Key"
      formSchema={createApiKeyInputSchema}
      defaultValues={() => ({
        apiKey: {
          name: '',
          type: FlowgladApiKeyType.Secret as const,
          pricingModelId: focusedPricingModelId,
        },
      })}
      onSubmit={async (data) => {
        const result = await createApiKey.mutateAsync(data)
        setRawApiKey(result.shownOnlyOnceKey)
        setLivemode(result.apiKey.livemode)
      }}
      onSuccess={() => {
        trpcContext.apiKeys.get.invalidate()
      }}
      hideFooter={rawApiKey ? true : false}
      autoClose={false}
    >
      {rawApiKey ? (
        <div className="flex flex-col gap-4">
          <div
            className="flex flex-row gap-4 items-center cursor-pointer w-full"
            onClick={copyTextHandler}
          >
            <div className="flex-1 relative">
              <Input
                value={rawApiKey}
                readOnly
                className="w-full cursor-pointer pr-10"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Copy size={16} />
              </div>
            </div>
          </div>
          {livemode ? (
            <p className="text-sm text-foreground text-orange-600">
              This key is only shown once.
            </p>
          ) : null}
          <p className="text-sm text-foreground">
            Copy this key and save it in your environment variables.
          </p>
        </div>
      ) : (
        <ApiKeyFormFields hidePricingModelSelector />
      )}
    </FormModal>
  )
}

export default CreateApiKeyModal
