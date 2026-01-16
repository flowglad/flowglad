import { notFound } from 'next/navigation'
import core from '@/utils/core'
import { EmailPreviewErrorBoundary } from './EmailPreviewErrorBoundary'
import InternalDemoPage from './InternalDemoPage'
import MoREmailPreview from './MoREmailPreview'
import {
  type EmailType,
  getEmailType,
  getViewType,
  type ViewType,
} from './mockData'
import {
  PaymentFailedPreview,
  SubscriptionAdjustedPreview,
  SubscriptionCanceledPreview,
  SubscriptionCancellationScheduledPreview,
  SubscriptionCreatedPreview,
  SubscriptionUpgradedPreview,
} from './SubscriptionEmailPreviews'

// ============================================================================
// Types
// ============================================================================

interface SearchParams {
  mor?: string
  email?: string
  trialing?: string
  testMode?: string
  hasRetry?: string
  view?: string
}

interface ParsedParams {
  isMoR: boolean
  emailType: EmailType
  isTrialing: boolean
  isTestMode: boolean
  hasRetry: boolean
  viewType: ViewType
}

// ============================================================================
// Email Preview Lookup Map
// ============================================================================

type EmailPreviewRenderer = (params: ParsedParams) => React.ReactNode

const emailPreviewMap: Record<EmailType, EmailPreviewRenderer> = {
  'order-receipt': ({ isMoR, isTestMode }) => (
    <MoREmailPreview isMoR={isMoR} testMode={isTestMode} />
  ),
  'subscription-created': ({ isTestMode }) => (
    <SubscriptionCreatedPreview testMode={isTestMode} />
  ),
  'subscription-upgraded': ({ isTrialing, isTestMode }) => (
    <SubscriptionUpgradedPreview
      trialing={isTrialing}
      testMode={isTestMode}
    />
  ),
  'subscription-adjusted-upgrade': ({ isTestMode }) => (
    <SubscriptionAdjustedPreview
      adjustmentType="upgrade"
      testMode={isTestMode}
    />
  ),
  'subscription-adjusted-downgrade': ({ isTestMode }) => (
    <SubscriptionAdjustedPreview
      adjustmentType="downgrade"
      testMode={isTestMode}
    />
  ),
  'subscription-canceled': ({ isTestMode }) => (
    <SubscriptionCanceledPreview testMode={isTestMode} />
  ),
  'subscription-cancellation-scheduled': ({ isTestMode }) => (
    <SubscriptionCancellationScheduledPreview testMode={isTestMode} />
  ),
  'payment-failed': ({ hasRetry, isTestMode }) => (
    <PaymentFailedPreview
      hasRetryDate={hasRetry}
      testMode={isTestMode}
    />
  ),
}

// ============================================================================
// Helper Functions
// ============================================================================

const parseSearchParams = (params: SearchParams): ParsedParams => ({
  isMoR: params.mor !== 'false',
  emailType: getEmailType(params.email),
  isTrialing: params.trialing === 'true',
  isTestMode: params.testMode === 'true',
  hasRetry: params.hasRetry !== 'false', // default to true
  viewType: getViewType(params.view),
})

// ============================================================================
// Page Component
// ============================================================================

const DemoPage = async ({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) => {
  if (core.IS_PROD) {
    return notFound()
  }

  const rawParams = await searchParams
  const params = parseSearchParams(rawParams)

  const renderEmailPreview = () => {
    const renderer = emailPreviewMap[params.emailType]
    return renderer(params)
  }

  // Render email preview section
  const renderEmailsView = () => (
    <section className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Email Preview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Preview email templates with different configurations
        </p>
      </div>

      <EmailPreviewErrorBoundary templateName={params.emailType}>
        <div className="rounded-lg border bg-card">
          {renderEmailPreview()}
        </div>
      </EmailPreviewErrorBoundary>
    </section>
  )

  // Render pricing table section
  const renderPricingTableView = () => (
    <section className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Pricing Table Demo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Interactive pricing table component
        </p>
      </div>
      <InternalDemoPage />
    </section>
  )

  return (
    <div className="flex-1 overflow-auto">
      {params.viewType === 'pricing-table'
        ? renderPricingTableView()
        : renderEmailsView()}
    </div>
  )
}

export default DemoPage
