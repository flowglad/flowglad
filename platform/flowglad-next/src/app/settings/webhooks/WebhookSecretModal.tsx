'use client'

import Modal from '@/components/ion/Modal'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'

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
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      title="Webhook Signing Secret"
    >
      <div className="flex flex-col gap-4">
        <CopyableTextTableCell
          copyText={secret}
          className="bg-surface-subtle p-3 rounded-radius-md"
        >
          {secret}
        </CopyableTextTableCell>
        <p className="text-sm text-subtle">
          {`Keep this secret somewhere safe and do not commit it to your source code. You'll need it to verify webhook signatures.`}
        </p>
      </div>
    </Modal>
  )
}

export default WebhookSecretModal
