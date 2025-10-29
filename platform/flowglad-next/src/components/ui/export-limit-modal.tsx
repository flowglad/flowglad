import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Mail, Users } from 'lucide-react'

interface ExportLimitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerCount: number
}

export function ExportLimitModal({
  open,
  onOpenChange,
  customerCount,
}: ExportLimitModalProps) {
  const handleContactSupport = () => {
    window.open(
      'mailto:hello@flowglad.com?subject=Customer Data Export Request',
      '_blank'
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-orange-500" />
            <DialogTitle>Export Limit Reached</DialogTitle>
          </div>
          <DialogDescription className="space-y-2">
            <p>
              Oops! You have over 3 customers (
              {customerCount.toLocaleString()} total).
            </p>
            <p>
              For large data exports, please email us and we&apos;ll
              help you get your customer data.
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleContactSupport} className="gap-2">
            <Mail className="h-4 w-4" />
            Email Support
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
