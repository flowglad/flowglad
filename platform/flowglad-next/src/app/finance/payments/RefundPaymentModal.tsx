'use client'
import FormModal from '@/components/forms/FormModal'
import {
  Payment,
  refundPaymentInputSchema,
} from '@/db/schema/payments'
import { trpc } from '@/app/_trpc/client'

interface RefundPaymentModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  payment: Payment.ClientRecord
}

const RefundPaymentModal = ({
  isOpen,
  setIsOpen,
  payment,
}: RefundPaymentModalProps) => {
  const refundPayment = trpc.payments.refund.useMutation()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      onSubmit={refundPayment.mutateAsync}
      formSchema={refundPaymentInputSchema}
      defaultValues={{ id: payment.id }}
      title="Refund Payment"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium">Refund Payment?</p>
        <p className="text-sm text-gray-500">
          This action is non-reversible.
        </p>
      </div>
    </FormModal>
  )
}

export default RefundPaymentModal
