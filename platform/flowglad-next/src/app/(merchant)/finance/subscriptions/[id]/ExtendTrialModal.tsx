'use client'

import { format, startOfDay } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface ExtendTrialModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  subscriptionId: string
  currentTrialEnd?: number
}

export const ExtendTrialModal = ({
  isOpen,
  setIsOpen,
  subscriptionId,
  currentTrialEnd,
}: ExtendTrialModalProps) => {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    undefined
  )
  const [calendarOpen, setCalendarOpen] = useState(false)

  const extendTrialMutation =
    trpc.subscriptions.extendTrial.useMutation({
      onSuccess: () => {
        toast.success('Trial extended successfully')
        router.refresh()
        setIsOpen(false)
        setSelectedDate(undefined)
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to extend trial')
      },
    })

  const handleSubmit = () => {
    if (!selectedDate) {
      return
    }

    const dateString = format(selectedDate, 'yyyy-MM-dd')
    extendTrialMutation.mutate({
      id: subscriptionId,
      newTrialEndDate: dateString,
    })
  }

  const handleCancel = () => {
    setIsOpen(false)
    setSelectedDate(undefined)
  }

  const currentTrialEndDate = currentTrialEnd
    ? new Date(currentTrialEnd)
    : undefined

  const minDate = currentTrialEndDate
    ? startOfDay(
        new Date(currentTrialEndDate.getTime() + 24 * 60 * 60 * 1000)
      )
    : startOfDay(new Date())

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extend Trial</DialogTitle>
          <DialogDescription>
            Select a new trial end date. The trial will end at 11:59
            PM ET on the selected date.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {currentTrialEndDate && (
            <div className="text-sm text-muted-foreground">
              Current trial ends:{' '}
              <span className="font-medium text-foreground">
                {format(currentTrialEndDate, 'MMM d, yyyy h:mm a')}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label
              htmlFor="new-trial-end"
              className="text-sm font-medium"
            >
              New Trial End Date
            </label>
            <Popover
              open={calendarOpen}
              onOpenChange={setCalendarOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  id="new-trial-end"
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !selectedDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate
                    ? format(selectedDate, 'MMM d, yyyy')
                    : 'Select a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date)
                    setCalendarOpen(false)
                  }}
                  disabled={{ before: minDate }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Trial will end at 11:59 PM ET on the selected date
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={handleCancel}
            disabled={extendTrialMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedDate || extendTrialMutation.isPending}
          >
            {extendTrialMutation.isPending
              ? 'Extending...'
              : 'Extend Trial'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
