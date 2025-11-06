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
  customerLimit: number
}

export function ExportLimitModal({
  open,
  onOpenChange,
  customerCount,
  customerLimit,
}: ExportLimitModalProps) {
  const handleContactSupport = () => {
    const subject = 'Customer Data Export Request'
    const body = `Hello Flowglad Team,

I need help exporting my customer data. I have ${customerCount.toLocaleString()} customers in my account, which exceeds the current export limit of ${customerLimit} customers.

Thank you for your assistance!

Best regards,`

    const mailtoUrl = `mailto:hello@flowglad.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(mailtoUrl, '_blank')
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
              Oops! You have over {customerLimit} customers (
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
