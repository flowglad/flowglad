'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { editFeatureSchema, Feature } from '@/db/schema/features'

interface ToggleFeatureModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  feature: Feature.ClientRecord
}

/**
 * Modal for activating/deactivating a feature
 *
 * When deactivating:
 * - Prevents new subscriptions from getting this feature
 * - Existing customers retain access to the feature
 *
 * When activating:
 * - Allows new subscriptions to include this feature
 */
const ToggleFeatureModal: React.FC<ToggleFeatureModalProps> = ({
  isOpen,
  setIsOpen,
  feature,
}) => {
  const router = useRouter()
  const updateFeature = trpc.features.update.useMutation()

  const handleToggleActive = async () => {
    const data = {
      id: feature.id,
      feature: {
        ...feature,
        active: !feature.active,
      },
    }

    const parsed = editFeatureSchema.safeParse(data)
    if (!parsed.success) {
      const errorMessage = parsed.error.issues
        .map((issue) => issue.message)
        .join(', ')
      toast.error(errorMessage || 'Invalid feature data')
      return
    }

    try {
      await updateFeature.mutateAsync(parsed.data)
      toast.success(
        `Feature ${feature.active ? 'deactivated' : 'activated'} successfully`
      )
      router.refresh()
      setIsOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${feature.active ? 'deactivate' : 'activate'} feature`
      )
    }
  }

  const modalText = feature.active ? (
    <div className="text-muted-foreground flex flex-col gap-4">
      <p>
        Deactivating will prevent new subscriptions from including
        this feature.
      </p>
      <p>
        Existing customers will retain access to this feature on their
        current subscriptions.
      </p>
    </div>
  ) : (
    <div className="text-muted-foreground flex flex-col gap-4">
      <p>
        Activating will allow new subscriptions to include this
        feature.
      </p>
      <p>Are you sure you want to activate this feature?</p>
    </div>
  )

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!updateFeature.isPending) {
          setIsOpen(open)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {feature.active
              ? 'Deactivate feature'
              : 'Activate feature'}
          </DialogTitle>
        </DialogHeader>
        {modalText}
        <DialogFooter>
          <div className="flex flex-1 justify-end gap-2 w-full">
            <Button
              variant="secondary"
              size="default"
              onClick={() => setIsOpen(false)}
              disabled={updateFeature.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="default"
              onClick={handleToggleActive}
              disabled={updateFeature.isPending}
            >
              {feature.active
                ? 'Deactivate feature'
                : 'Activate feature'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ToggleFeatureModal
