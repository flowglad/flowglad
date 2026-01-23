import { sentenceCase } from 'change-case'
import type React from 'react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import ClonePricingModelFormFields from '@/components/forms/ClonePricingModelFormFields'
import FormModal from '@/components/forms/FormModal'
import { useAuthenticatedContext } from '@/contexts/authContext'
import {
  clonePricingModelInputSchema,
  type PricingModel,
} from '@/db/schema/pricingModels'
import { DestinationEnvironment } from '@/types'

interface ClonePricingModelModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  pricingModel: PricingModel.ClientRecord
}

const ClonePricingModelModal: React.FC<
  ClonePricingModelModalProps
> = ({ isOpen, setIsOpen, pricingModel }) => {
  const { livemode } = useAuthenticatedContext()
  const trpcUtils = trpc.useUtils()

  // Check if org already has a livemode PM
  // We need to know if cloning to livemode would be blocked
  // Explicitly query for livemode PMs so testmode users also see the warning
  const { data: livemodeTableData } =
    trpc.pricingModels.getTableRows.useQuery({
      pageSize: 1,
      filters: { livemode: true },
    })
  const hasLivemodePricingModel = (livemodeTableData?.total ?? 0) >= 1

  // Track whether the livemode warning is being shown to disable submit
  const [showLivemodeWarning, setShowLivemodeWarning] =
    useState(false)
  const handleWarningChange = useCallback((showWarning: boolean) => {
    setShowLivemodeWarning(showWarning)
  }, [])

  const clonePricingModelMutation =
    trpc.pricingModels.clone.useMutation({
      onSuccess: ({ pricingModel }) => {
        if (pricingModel.livemode !== livemode) {
          toast.success(
            `Pricing model cloned into ${sentenceCase(pricingModel.livemode ? DestinationEnvironment.Livemode : DestinationEnvironment.Testmode)} environment`
          )
        }
        // Invalidate to refresh the count for "can create" check and clone warning
        trpcUtils.pricingModels.getTableRows.invalidate()
      },
      onError: (error) => {
        toast.error('Failed to clone pricing model')
      },
    })
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Clone Pricing Model"
      formSchema={clonePricingModelInputSchema}
      defaultValues={{
        id: pricingModel.id,
        name: `${pricingModel.name} (Copy)`,
      }}
      onSubmit={clonePricingModelMutation.mutateAsync}
      submitButtonText="Clone Pricing Model"
      submitDisabled={showLivemodeWarning}
    >
      <ClonePricingModelFormFields
        hasLivemodePricingModel={hasLivemodePricingModel}
        onWarningChange={handleWarningChange}
        livemode={livemode ?? false}
      />
    </FormModal>
  )
}

export default ClonePricingModelModal
