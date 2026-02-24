'use client'

import type { PricingModel } from '@db-core/schema/pricingModels'
import { AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

interface ReplaceLivePricingModelModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  pricingModel: PricingModel.ClientRecord
}

const ReplaceLivePricingModelModal: React.FC<
  ReplaceLivePricingModelModalProps
> = ({ isOpen, setIsOpen, pricingModel }) => {
  const router = useRouter()
  const trpcUtils = trpc.useUtils()
  const [selectedTestPmId, setSelectedTestPmId] = useState<string>('')

  const { data: allPricingModels, isLoading } =
    trpc.pricingModels.getAllForSwitcher.useQuery(undefined, {
      enabled: isOpen,
    })

  const testPricingModels =
    allPricingModels?.items
      ?.filter((pm) => !pm.pricingModel.livemode)
      .map((pm) => pm.pricingModel) ?? []

  const makeLiveMutation = trpc.pricingModels.makeLive.useMutation({
    onSuccess: () => {
      toast.success('Livemode pricing model replaced successfully')
      trpcUtils.pricingModels.getTableRows.invalidate()
      router.refresh()
      setIsOpen(false)
      setSelectedTestPmId('')
    },
    onError: (error) => {
      toast.error(`Failed to replace pricing model: ${error.message}`)
    },
  })

  const handleSubmit = async () => {
    if (!selectedTestPmId) return
    await makeLiveMutation.mutateAsync({
      testPricingModelId: selectedTestPmId,
    })
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          setSelectedTestPmId('')
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Replace Livemode Pricing Model</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Select a test pricing model to replace your current
            livemode setup. The chosen model's configuration will be
            applied to livemode going forward.
          </p>

          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select
              value={selectedTestPmId}
              onValueChange={setSelectedTestPmId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a test pricing model" />
              </SelectTrigger>
              <SelectContent>
                {testPricingModels.map((pm) => (
                  <SelectItem key={pm.id} value={pm.id}>
                    {pm.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

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
              onClick={() => {
                setIsOpen(false)
                setSelectedTestPmId('')
              }}
              disabled={makeLiveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !selectedTestPmId || makeLiveMutation.isPending
              }
            >
              {makeLiveMutation.isPending
                ? 'Replacing...'
                : 'Replace'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ReplaceLivePricingModelModal
