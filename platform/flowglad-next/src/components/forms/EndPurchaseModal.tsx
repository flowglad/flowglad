'use client'
import { useForm, Controller } from 'react-hook-form'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface ModalInterfaceProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}
import { trpc } from '@/app/_trpc/client'
import { Purchase } from '@/db/schema/purchases'
import { Button } from '@/components/ui/button'
import Datepicker from '@/components/ion/Datepicker'

interface EndPurchaseModalProps extends ModalInterfaceProps {
  purchase: Purchase.ClientRecord
}

interface EndPurchaseFormData {
  endDate: Date | null
}

const EndPurchaseModal = ({
  setIsOpen,
  isOpen,
  purchase,
}: EndPurchaseModalProps) => {
  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<EndPurchaseFormData>({
    defaultValues: {
      endDate: null,
    },
  })

  const endPurchase = trpc.purchases.update.useMutation()

  const onSubmit = async (data: EndPurchaseFormData) => {
    if (!data.endDate) return

    try {
      await endPurchase.mutateAsync({
        purchase: {
          id: purchase.id,
          priceType: purchase.priceType,
          endDate: data.endDate,
        },
      })
      setIsOpen(false)
      reset()
    } catch (error) {
      console.error('Failed to end purchase:', error)
      // Handle error (e.g., show error message to user)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="overflow-y-visible">
        <DialogHeader>
          <DialogTitle>End Purchase</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4 overflow-y-visible"
        >
          <p>Select an end date for the purchase: {purchase.name}</p>
          <Controller
            name="endDate"
            control={control}
            rules={{ required: 'End date is required' }}
            render={({ field }) => {
              return (
                <Datepicker
                  {...field}
                  onSelect={(value) => field.onChange(value)}
                  value={field.value || undefined}
                />
              )
            }}
          />
          {errors.endDate && (
            <span className="text-destructive text-sm">
              {errors.endDate.message}
            </span>
          )}
          <DialogFooter>
            <div className="flex justify-end gap-2 mt-4 w-full">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button variant="destructive" type="submit">
                End Purchase
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default EndPurchaseModal
