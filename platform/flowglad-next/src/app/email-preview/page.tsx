import Link from 'next/link'
import {
  EMAIL_PREVIEWS,
  getVariantsForEmailType,
} from '@/email-templates/previews/mockData'
import {
  EMAIL_REGISTRY,
  type EmailType,
} from '@/utils/email/registry'

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
      <h2 className="text-xl font-semibold mb-4 text-gray-800">
        {title}
      </h2>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {types.map((emailType) => {
          const config = EMAIL_REGISTRY[emailType]
          const variants = getVariantsForEmailType(emailType)

          return (
            <div
              key={emailType}
              className="border rounded-lg p-4 bg-white shadow-sm"
            >
              <h3 className="font-medium text-gray-900 mb-1">
                {emailType.split('.').slice(1).join(' → ')}
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                {config.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {variants.map((variant) => (
                  <Link
                    key={`${emailType}-${variant}`}
                    href={`/email-preview/${encodeURIComponent(emailType)}/${variant}`}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    {variant}
                  </Link>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                <span
                  className={`inline-block px-1.5 py-0.5 rounded ${
                    config.recipientType === 'customer'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}
                >
                  {config.recipientType}
                </span>
                <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                  {config.category}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Email Template Previews
          </h1>
          <p className="text-gray-600">
            Internal page for visual testing of all email templates.
            Click on a variant to preview the rendered email.
          </p>
          <p className="text-sm text-gray-500 mt-2">
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
