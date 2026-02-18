'use client'

import type { PricingModel } from '@db-core/schema/pricingModels'
import { AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface MakeLivePricingModelModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  pricingModel: PricingModel.ClientRecord
}

const MakeLivePricingModelModal: React.FC<
  MakeLivePricingModelModalProps
> = ({ isOpen, setIsOpen, pricingModel }) => {
  const router = useRouter()
  const trpcUtils = trpc.useUtils()

  const makeLiveMutation = trpc.pricingModels.makeLive.useMutation({
    onSuccess: () => {
      toast.success('Pricing model configuration applied to livemode')
      trpcUtils.pricingModels.getTableRows.invalidate()
      router.refresh()
      setIsOpen(false)
    },
    onError: (error) => {
      toast.error(
        `Failed to make pricing model live: ${error.message}`
      )
    },
  })

  const handleSubmit = async () => {
    await makeLiveMutation.mutateAsync({
      testPricingModelId: pricingModel.id,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Make This Pricing Model Live?</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            This will replace your current livemode pricing model
            setup with the configuration from this test pricing model.
          </p>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Important</AlertTitle>
            <AlertDescription className="mt-2">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>
                  Existing transactions in livemode will remain
                  unchanged. New transactions created going forward
                  will use the new setup.
                </li>
                <li>
                  Usage meters cannot be removed, so any existing
                  usage meters in the livemode pricing model will
                  remain.
                </li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="pt-4">
          <div className="flex flex-1 justify-end gap-2 w-full">
            <Button
              variant="secondary"
              onClick={() => setIsOpen(false)}
              disabled={makeLiveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={makeLiveMutation.isPending}
            >
              {makeLiveMutation.isPending ? 'Applying...' : 'Confirm'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default MakeLivePricingModelModal
