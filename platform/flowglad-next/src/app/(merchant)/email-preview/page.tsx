import { getVariantsForEmailType } from '@/email-templates/previews/mockData'
import {
  EMAIL_REGISTRY,
  type EmailType,
} from '@/utils/email/registry'
import { EmailCard } from './EmailCard'

/**
 * Email preview listing page.
 *
 * Lists all registered email types with links to their preview variants.
 * This is an internal page for visual testing of email templates.
 */
export default function EmailPreviewPage() {
  const emailTypes = Object.keys(EMAIL_REGISTRY) as EmailType[]

  // Group email types by category
  const customerSubscription = emailTypes.filter((t) =>
    t.startsWith('customer.subscription.')
  )
  const customerPayment = emailTypes.filter((t) =>
    t.startsWith('customer.payment.')
  )
  const customerTrial = emailTypes.filter((t) =>
    t.startsWith('customer.trial.')
  )
  const customerAuth = emailTypes.filter((t) =>
    t.startsWith('customer.auth.')
  )
  const orgSubscription = emailTypes.filter((t) =>
    t.startsWith('organization.subscription.')
  )
  const orgPayment = emailTypes.filter((t) =>
    t.startsWith('organization.payment.')
  )
  const orgNotification = emailTypes.filter((t) =>
    t.startsWith('organization.notification.')
  )

  const renderEmailGroup = (title: string, types: EmailType[]) => (
    <div className="mb-8">
      <h2 className="text-xl font-semibold mb-4 text-foreground">
        {title}
      </h2>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {types.map((emailType) => {
          const config = EMAIL_REGISTRY[emailType]
          const variants = getVariantsForEmailType(emailType)

          return (
            <EmailCard
              key={emailType}
              emailType={emailType}
              description={config.description}
              variants={variants}
            />
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Email Template Previews
          </h1>
          <p className="text-muted-foreground">
            Internal page for visual testing of all email templates.
            Click on a variant to preview the rendered email.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Total: {emailTypes.length} email types registered
          </p>
        </div>

        <div className="space-y-8">
          {renderEmailGroup(
            'Customer Subscription Emails',
            customerSubscription
          )}
          {renderEmailGroup(
            'Customer Payment Emails',
            customerPayment
          )}
          {renderEmailGroup('Customer Trial Emails', customerTrial)}
          {renderEmailGroup('Customer Auth Emails', customerAuth)}
          {renderEmailGroup(
            'Organization Subscription Emails',
            orgSubscription
          )}
          {renderEmailGroup(
            'Organization Payment Emails',
            orgPayment
          )}
          {renderEmailGroup(
            'Organization Notification Emails',
            orgNotification
          )}
        </div>
      </div>
    </div>
  )
}
