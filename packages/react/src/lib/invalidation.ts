import { FlowgladActionKey } from '@flowglad/shared'
import type { QueryClient } from '@tanstack/react-query'
import { FEATURES_QUERY_KEY } from '../useFeatures'
import { PAYMENT_METHODS_QUERY_KEY } from '../usePaymentMethods'
import { SUBSCRIPTIONS_QUERY_KEY } from '../useSubscriptions'
import { USAGE_METERS_QUERY_KEY } from '../useUsageMeters'

/**
 * Invalidates all customer-related query keys.
 * This ensures that when subscription mutations fire (cancel, uncancel, adjust),
 * all customer data is refreshed.
 *
 * @param queryClient - The React Query client instance
 */
export const invalidateCustomerData = async (
  queryClient: QueryClient
) => {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: [SUBSCRIPTIONS_QUERY_KEY],
    }),
    queryClient.invalidateQueries({ queryKey: [FEATURES_QUERY_KEY] }),
    queryClient.invalidateQueries({
      queryKey: [PAYMENT_METHODS_QUERY_KEY],
    }),
    queryClient.invalidateQueries({
      queryKey: [USAGE_METERS_QUERY_KEY],
    }),
    queryClient.invalidateQueries({
      queryKey: [FlowgladActionKey.GetCustomerBilling],
    }),
  ])
}
