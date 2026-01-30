'use client'

import type { Customer } from '@db-core/schema/customers'
import { AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import { useListPricingModelsQuery } from '@/app/hooks/useListPricingModelsQuery'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

interface MigrateCustomerPricingModelModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  customer: Customer.ClientRecord
}

const MigrateCustomerPricingModelModal = ({
  isOpen,
  setIsOpen,
  customer,
}: MigrateCustomerPricingModelModalProps) => {
  const router = useRouter()
  const [newPricingModelId, setNewPricingModelId] =
    useState<string>('')
  const [confirmed, setConfirmed] = useState(false)

  const { data: pricingModels, isLoading: isLoadingPricingModels } =
    useListPricingModelsQuery()
  const { data: defaultPricingModel } =
    trpc.pricingModels.getDefault.useQuery({})
  const defaultPricingModelId = defaultPricingModel?.pricingModel.id

  const migratePricingModel =
    trpc.customers.migratePricingModel.useMutation({
      onSuccess: () => {
        toast.success('Customer pricing model migrated successfully')
        router.refresh()
        setIsOpen(false)
        resetForm()
      },
      onError: (error) => {
        toast.error(
          `Failed to migrate pricing model: ${error.message}`
        )
      },
    })

  const resetForm = () => {
    setNewPricingModelId('')
    setConfirmed(false)
  }

  const handleSubmit = async () => {
    if (!newPricingModelId || !confirmed) {
      return
    }

    await migratePricingModel.mutateAsync({
      externalId: customer.externalId,
      newPricingModelId,
    })
  }

  const currentPricingModel = pricingModels?.data?.find(
    (pm) => pm.id === customer.pricingModelId
  )

  const isSubmitDisabled =
    !newPricingModelId ||
    !confirmed ||
    migratePricingModel.isPending ||
    newPricingModelId === customer.pricingModelId

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          resetForm()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Migrate Customer Pricing Model</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {/* Current Pricing Model */}
          <div className="flex flex-col gap-2">
            <Label>Current Pricing Model</Label>
            <div className="px-3 py-2 border rounded-md bg-muted">
              {currentPricingModel?.name || 'Unknown'}
            </div>
          </div>

          {/* New Pricing Model Selector */}
          <div className="flex flex-col gap-2">
            <Label>New Pricing Model</Label>
            {isLoadingPricingModels ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select
                value={newPricingModelId}
                onValueChange={setNewPricingModelId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select new pricing model" />
                </SelectTrigger>
                <SelectContent>
                  {pricingModels?.data?.map((pricingModel) => (
                    <SelectItem
                      key={pricingModel.id}
                      value={pricingModel.id}
                      disabled={
                        pricingModel.id === customer.pricingModelId
                      }
                    >
                      <span className="flex items-center gap-2">
                        {pricingModel.name}
                        {pricingModel.id ===
                          defaultPricingModelId && (
                          <Badge variant="outline">Default</Badge>
                        )}
                        {pricingModel.id ===
                          customer.pricingModelId && (
                          <Badge variant="secondary">Current</Badge>
                        )}
                      </span>
                    </SelectItem>
                  )) || []}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Warning Banner */}
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              Warning: This action will immediately cancel ALL
              existing subscriptions
            </AlertTitle>
            <AlertDescription className="mt-2">
              <div className="flex flex-col gap-2">
                <p>
                  Migrating this customer to a new pricing model will:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    Cancel all current subscriptions immediately
                  </li>
                  <li>
                    Create a new default free plan subscription on the
                    new pricing model
                  </li>
                  <li>This action cannot be undone</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>

          {/* Confirmation Checkbox */}
          <div className="flex items-start gap-3">
            <Checkbox
              id="confirm"
              checked={confirmed}
              onCheckedChange={(checked) =>
                setConfirmed(checked === true)
              }
            />
            <Label
              htmlFor="confirm"
              className="text-sm font-normal leading-5 cursor-pointer"
            >
              I understand that all existing subscriptions will be
              canceled
            </Label>
          </div>
        </div>

        <DialogFooter className="pt-4">
          <div className="flex flex-1 justify-end gap-2 w-full">
            <Button
              variant="secondary"
              onClick={() => {
                setIsOpen(false)
                resetForm()
              }}
              disabled={migratePricingModel.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
            >
              {migratePricingModel.isPending
                ? 'Migrating...'
                : 'Migrate Pricing Model'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default MigrateCustomerPricingModelModal
