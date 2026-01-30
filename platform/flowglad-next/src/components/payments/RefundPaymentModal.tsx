'use client'
import {
  type Payment,
  refundPaymentInputSchema,
} from '@db-core/schema/payments'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'

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
      defaultValues={() => ({ id: payment.id })}
      title="Refund Payment"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          This action is non-reversible.
        </p>
      </div>
    </FormModal>
  )
}

export default RefundPaymentModal
