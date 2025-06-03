import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { subscriptionWithCurrent } from '@/db/tableMethods/subscriptionMethods'
import InnerSubscriptionPage from './InnerSubscriptionPage'
import { selectRichSubscriptionsAndActiveItems } from '@/db/tableMethods/subscriptionItemMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'

const SubscriptionPage = async ({
  params,
}: {
  params: Promise<{ id: string }>
}) => {
  const { id } = await params
  const { subscription, defaultPaymentMethod } =
    await authenticatedTransaction(async ({ transaction }) => {
      const [subscription] =
        await selectRichSubscriptionsAndActiveItems(
          { id },
          transaction
        )

      const defaultPaymentMethod = subscription.defaultPaymentMethodId
        ? await selectPaymentMethodById(
            subscription.defaultPaymentMethodId,
            transaction
          )
        : null
      return { subscription, defaultPaymentMethod }
    })
  return (
    <InnerSubscriptionPage
      subscription={subscriptionWithCurrent(subscription)}
      defaultPaymentMethod={defaultPaymentMethod ?? null}
    />
  )
}

export default SubscriptionPage
