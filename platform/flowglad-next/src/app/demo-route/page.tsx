import { notFound } from 'next/navigation'
import core from '@/utils/core'
import InternalDemoPage from './InternalDemoPage'
import MoREmailPreview from './MoREmailPreview'

type EmailTemplate =
  | 'invoice-notification'
  | 'invoice-reminder'
  | 'order-receipt'

const DemoPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; mor?: string }>
}) => {
  if (core.IS_PROD) {
    return notFound()
  }

  const params = await searchParams
  const template =
    (params.template as EmailTemplate) || 'invoice-notification'
  const isMoR = params.mor !== 'false'

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Demo Page</h1>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">
          MoR Email Preview
        </h2>
        <div className="mb-4 flex gap-2 flex-wrap">
          <a
            href="/demo-route?template=invoice-notification&mor=true"
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            Invoice Notification (MoR)
          </a>
          <a
            href="/demo-route?template=invoice-notification&mor=false"
            className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
          >
            Invoice Notification
          </a>
          <a
            href="/demo-route?template=invoice-reminder&mor=true"
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            Invoice Reminder (MoR)
          </a>
          <a
            href="/demo-route?template=invoice-reminder&mor=false"
            className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
          >
            Invoice Reminder
          </a>
          <a
            href="/demo-route?template=order-receipt&mor=true"
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            Order Receipt (MoR)
          </a>
          <a
            href="/demo-route?template=order-receipt&mor=false"
            className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
          >
            Order Receipt
          </a>
        </div>
        <MoREmailPreview template={template} isMoR={isMoR} />
      </div>

      <div className="border-t pt-8">
        <h2 className="text-xl font-semibold mb-2">
          Pricing Table Demo
        </h2>
        <InternalDemoPage />
      </div>
    </div>
  )
}

export default DemoPage
