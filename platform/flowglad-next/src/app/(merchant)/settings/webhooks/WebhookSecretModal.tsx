'use client'

import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface WebhookSecretModalProps {
  secret: string
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const WebhookSecretModal = ({
  secret,
  isOpen,
  setIsOpen,
}: WebhookSecretModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="w-[calc(100vw-32px)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Webhook Signing Secret</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <CopyableTextTableCell
            copyText={secret}
            className="bg-surface-subtle p-3 rounded-lg-md"
          >
            {secret}
          </CopyableTextTableCell>
          <p className="text-sm text-muted-foreground">
            {`Keep this secret somewhere safe and do not commit it to your source code. You'll need it to verify webhook signatures.`}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default WebhookSecretModal
