import { render } from '@react-email/render'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPreviewData } from '@/email-templates/previews/mockData'
import {
  EMAIL_REGISTRY,
  type EmailType,
} from '@/utils/email/registry'

interface EmailPreviewPageProps {
  params: Promise<{
    emailType: string
    variant: string
  }>
}

/**
 * Individual email preview page.
 *
 * Renders a specific email template variant with mock data.
 */
export default async function EmailPreviewVariantPage({
  params,
}: EmailPreviewPageProps) {
  const { emailType: encodedEmailType, variant } = await params
  const emailType = decodeURIComponent(encodedEmailType) as EmailType

  // Validate email type exists in registry
  if (!(emailType in EMAIL_REGISTRY)) {
    notFound()
  }

  // Get preview data for this variant
  const previewData = getPreviewData(emailType, variant)
  if (!previewData) {
    notFound()
  }

  const config = EMAIL_REGISTRY[emailType]

  // Load and render the template
  const template = await config.getTemplate()
  const emailElement = await template(previewData as never)

  // Render to HTML for preview
  const emailHtml = await render(emailElement)

  // Calculate subject
  const subject =
    typeof config.defaultSubject === 'function'
      ? config.defaultSubject(previewData as never)
      : config.defaultSubject

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-dashed sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/email-preview"
                className="text-sm text-primary hover:text-primary/80 mb-1 inline-block"
              >
                ← Back to all emails
              </Link>
              <h1 className="text-xl font-semibold text-foreground">
                {emailType}
              </h1>
              <p className="text-sm text-muted-foreground">
                Variant:{' '}
                <span className="font-medium">{variant}</span>
              </p>
            </div>
            <div className="text-right">
              <div className="flex gap-2 mb-2">
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    config.recipientType === 'customer'
                      ? 'bg-jade-background text-jade-foreground'
                      : 'bg-secondary text-secondary-foreground'
                  }`}
                >
                  {config.recipientType}
                </span>
                <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                  {config.category}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {config.description}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Subject Preview - preserves email client appearance */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
          <div className="text-sm text-gray-500 mb-1">Subject:</div>
          <div className="font-medium text-gray-900">{subject}</div>
        </div>

        {/* Email Preview Frame - preserves email client appearance */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="bg-gray-50 border-b px-4 py-2 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
            <span className="ml-2 text-sm text-gray-500">
              Email Preview
            </span>
          </div>
          <div className="p-0">
            <iframe
              srcDoc={emailHtml}
              className="w-full min-h-[800px] border-0"
              title={`Preview of ${emailType} - ${variant}`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Generate static params for all email type/variant combinations.
 */
export async function generateStaticParams() {
  const { EMAIL_PREVIEWS } = await import(
    '@/email-templates/previews/mockData'
  )

  const params: Array<{ emailType: string; variant: string }> = []

  for (const emailType of Object.keys(
    EMAIL_REGISTRY
  ) as EmailType[]) {
    const previewData = EMAIL_PREVIEWS[emailType]
    for (const variant of Object.keys(previewData)) {
      params.push({
        emailType: encodeURIComponent(emailType),
        variant,
      })
    }
  }

  return params
}
