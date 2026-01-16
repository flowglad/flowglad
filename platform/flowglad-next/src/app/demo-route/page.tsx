import { notFound } from 'next/navigation'
import core from '@/utils/core'
import { EmailPreviewErrorBoundary } from './EmailPreviewErrorBoundary'
import InternalDemoPage from './InternalDemoPage'
import MoREmailPreview from './MoREmailPreview'
import {
  type EmailType,
  getEmailType,
  getViewType,
  type ParsedParams,
} from './mockData'
import {
  BillingPortalMagicLinkPreview,
  BillingPortalOTPPreview,
  ForgotPasswordPreview,
  OrgSubscriptionCanceledPreview,
  OrgSubscriptionCancellationScheduledPreview,
  OrgSubscriptionCreatedPreview,
  PaymentFailedPreview,
  PurchaseAccessTokenPreview,
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

// ============================================================================
// Email Preview Lookup Map
// ============================================================================

type EmailPreviewRenderer = (params: ParsedParams) => React.ReactNode

const emailPreviewMap: Record<EmailType, EmailPreviewRenderer> = {
  'order-receipt': ({ isMoR, livemode }) => (
    <MoREmailPreview isMoR={isMoR} livemode={livemode} />
  ),
  'subscription-created': ({ livemode }) => (
    <SubscriptionCreatedPreview livemode={livemode} />
  ),
  'subscription-upgraded': ({ isTrialing, livemode }) => (
    <SubscriptionUpgradedPreview
      trialing={isTrialing}
      livemode={livemode}
    />
  ),
  'subscription-adjusted-upgrade': ({ livemode }) => (
    <SubscriptionAdjustedPreview
      adjustmentType="upgrade"
      livemode={livemode}
    />
  ),
  'subscription-adjusted-downgrade': ({ livemode }) => (
    <SubscriptionAdjustedPreview
      adjustmentType="downgrade"
      livemode={livemode}
    />
  ),
  'subscription-canceled': ({ livemode }) => (
    <SubscriptionCanceledPreview livemode={livemode} />
  ),
  'subscription-cancellation-scheduled': ({ livemode }) => (
    <SubscriptionCancellationScheduledPreview livemode={livemode} />
  ),
  'payment-failed': ({ hasRetry, livemode }) => (
    <PaymentFailedPreview
      hasRetryDate={hasRetry}
      livemode={livemode}
    />
  ),
  'billing-portal-otp': ({ livemode }) => (
    <BillingPortalOTPPreview livemode={livemode} />
  ),
  'billing-portal-magic-link': ({ livemode }) => (
    <BillingPortalMagicLinkPreview livemode={livemode} />
  ),
  'forgot-password': ({ livemode }) => (
    <ForgotPasswordPreview livemode={livemode} />
  ),
  // Organization notification emails
  'org-subscription-created': ({ livemode }) => (
    <OrgSubscriptionCreatedPreview livemode={livemode} />
  ),
  'org-subscription-canceled': ({ livemode }) => (
    <OrgSubscriptionCanceledPreview livemode={livemode} />
  ),
  'org-subscription-cancellation-scheduled': ({ livemode }) => (
    <OrgSubscriptionCancellationScheduledPreview
      livemode={livemode}
    />
  ),
  // Purchase access
  'purchase-access-token': ({ livemode }) => (
    <PurchaseAccessTokenPreview livemode={livemode} />
  ),
}

// ============================================================================
// Helper Functions
// ============================================================================

const parseSearchParams = (params: SearchParams): ParsedParams => ({
  isMoR: params.mor !== 'false',
  emailType: getEmailType(params.email),
  isTrialing: params.trialing === 'true',
  livemode: params.testMode !== 'true', // Invert once at source
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
    <section className="p-6 max-w-[1536px] mx-auto">
      {/* Title Block - 4px gap between heading/description, 16px horizontal padding */}
      <div className="mb-4 px-4 flex flex-col gap-1">
        <h1 className="text-2xl font-bold leading-8">
          Email Preview
        </h1>
        <p className="text-sm leading-5 text-muted-foreground">
          Preview email templates with different configurations
        </p>
      </div>

      <EmailPreviewErrorBoundary templateName={params.emailType}>
        {renderEmailPreview()}
      </EmailPreviewErrorBoundary>
    </section>
  )

  // Render pricing table section
  const renderPricingTableView = () => (
    <section className="p-6 max-w-[1536px] mx-auto">
      {/* Title Block - 4px gap between heading/description */}
      <div className="mb-4 px-4 flex flex-col gap-1">
        <h1 className="text-2xl font-bold leading-8">
          Pricing Table Demo
        </h1>
        <p className="text-sm leading-5 text-muted-foreground">
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
