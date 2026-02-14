'use client'

import {
  useCustomerDetails,
  useFeatures,
  usePricingModel,
  usePurchases,
  useSubscriptions,
  useUsageMeters,
} from '@flowglad/nextjs'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'

export function DebugClient() {
  const { data: session } = authClient.useSession()
  const {
    customer,
    isLoading: isLoadingCustomer,
    error: customerError,
  } = useCustomerDetails()
  const {
    currentSubscriptions,
    isLoading: isLoadingSubscriptions,
    error: subscriptionsError,
  } = useSubscriptions()
  const {
    features,
    isLoading: isLoadingFeatures,
    error: featuresError,
  } = useFeatures()
  const {
    usageMeters,
    isLoading: isLoadingUsageMeters,
    error: usageMetersError,
  } = useUsageMeters()
  const {
    purchases,
    isLoading: isLoadingPurchases,
    error: purchasesError,
  } = usePurchases()
  const pricingModel = usePricingModel()

  const isLoading =
    isLoadingCustomer ||
    isLoadingSubscriptions ||
    isLoadingFeatures ||
    isLoadingUsageMeters ||
    isLoadingPurchases
  const error =
    customerError ||
    subscriptionsError ||
    featuresError ||
    usageMetersError ||
    purchasesError

  const userId = session?.user?.id ?? 'Not available'
  const activeOrganizationId =
    session?.session?.activeOrganizationId ?? 'Not available'
  const customerExternalId = customer?.externalId ?? 'Not available'

  const debugData = {
    isLoading,
    error: error?.message ?? null,
    customer,
    currentSubscriptions,
    features,
    usageMeters,
    purchases,
    pricingModel,
  }
  const billingJson = JSON.stringify(debugData, null, 2)

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Debug Information</h1>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>User Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <strong>User ID:</strong>{' '}
              <code className="bg-gray-100 px-2 py-1 rounded">
                {userId}
              </code>
            </div>
            <div>
              <strong>Active Organization ID:</strong>{' '}
              <code className="bg-gray-100 px-2 py-1 rounded">
                {activeOrganizationId}
              </code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <strong>Customer External ID:</strong>{' '}
              <code className="bg-gray-100 px-2 py-1 rounded">
                {customerExternalId}
              </code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Billing Object (JSON)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div>
                <strong>loaded:</strong>{' '}
                <code className="bg-gray-100 px-2 py-1 rounded">
                  {String(!isLoading)}
                </code>
              </div>
            </div>
            <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm">
              {billingJson}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
