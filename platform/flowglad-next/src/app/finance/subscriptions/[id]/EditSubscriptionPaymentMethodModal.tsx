'use client'

import { useState } from 'react'
import FormModal, {
  ModalInterfaceProps,
} from '@/components/forms/FormModal'
import {
  updateSubscriptionPaymentMethodSchema,
  UpdateSubscriptionPaymentMethod,
} from '@/db/schema/subscriptions'
import { trpc } from '@/app/_trpc/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { CardPaymentMethodLabel } from '@/components/PaymentMethodLabel'
import { PaymentMethodType } from '@/types'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import { useFormContext } from 'react-hook-form'

interface EditSubscriptionPaymentMethodModalProps
  extends ModalInterfaceProps {
  subscriptionId: string
  customerId: string
  currentPaymentMethodId?: string | null
}

const PaymentMethodSelector = ({
  paymentMethods,
  currentPaymentMethodId,
}: {
  paymentMethods: PaymentMethod.ClientRecord[]
  currentPaymentMethodId?: string | null
}) => {
  const form = useFormContext<UpdateSubscriptionPaymentMethod>()

  return (
    <FormField
      control={form.control}
      name="paymentMethodId"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <RadioGroup
              onValueChange={field.onChange}
              value={field.value}
              className="space-y-2"
            >
              {paymentMethods.map((pm) => (
                <label
                  key={pm.id}
                  htmlFor={pm.id}
                  className="flex items-center space-x-3 border rounded-lg p-3 hover:bg-accent transition-colors cursor-pointer"
                >
                  <RadioGroupItem value={pm.id} id={pm.id} />
                  <div className="flex-1">
                    {pm.type === PaymentMethodType.Card && (
                      <CardPaymentMethodLabel
                        brand={pm.paymentMethodData.brand as string}
                        last4={pm.paymentMethodData.last4 as string}
                        isDefault={pm.id === currentPaymentMethodId}
                      />
                    )}
                    {pm.type === PaymentMethodType.USBankAccount && (
                      <div className="flex items-center gap-2">
                        <span>Bank Account</span>
                        <span className="text-muted-foreground">
                          ••••{' '}
                          {(pm.paymentMethodData.last4 as string) ||
                            ''}
                        </span>
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function EditSubscriptionPaymentMethodModal({
  isOpen,
  setIsOpen,
  subscriptionId,
  customerId,
  currentPaymentMethodId,
}: EditSubscriptionPaymentMethodModalProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch payment methods for the customer
  const { data: paymentMethodsData, isLoading } =
    trpc.paymentMethods.list.useQuery({
      where: { customerId },
      limit: 100,
    })

  // Mutation to update subscription payment method
  const updatePaymentMethod =
    trpc.subscriptions.updatePaymentMethod.useMutation({
      onSuccess: () => {
        toast.success('Payment method updated successfully')
        setIsOpen(false)
        router.refresh()
      },
      onError: (error) => {
        toast.error(
          error.message || 'Failed to update payment method'
        )
        setIsSubmitting(false)
      },
    })

  const handleSubmit = async (
    data: UpdateSubscriptionPaymentMethod
  ) => {
    setIsSubmitting(true)
    await updatePaymentMethod.mutateAsync(data)
  }

  const defaultValues: UpdateSubscriptionPaymentMethod = {
    id: subscriptionId,
    paymentMethodId: currentPaymentMethodId || '',
  }

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Payment Method"
      formSchema={updateSubscriptionPaymentMethodSchema}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      submitButtonText={isSubmitting ? 'Updating...' : 'Update'}
      autoClose={false}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Select a payment method for this subscription.
        </p>

        {isLoading && (
          <p className="text-sm text-muted-foreground">
            Loading payment methods...
          </p>
        )}

        {!isLoading && paymentMethodsData?.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No payment methods available for this customer.
          </p>
        )}

        {!isLoading &&
          paymentMethodsData?.data &&
          paymentMethodsData.data.length > 0 && (
            <PaymentMethodSelector
              paymentMethods={paymentMethodsData.data}
              currentPaymentMethodId={currentPaymentMethodId}
            />
          )}
      </div>
    </FormModal>
  )
}
