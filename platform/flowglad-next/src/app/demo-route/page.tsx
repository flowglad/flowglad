import { notFound } from 'next/navigation'
import core from '@/utils/core'
import InternalDemoPage from './InternalDemoPage'
import MoREmailPreview from './MoREmailPreview'

const DemoPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ mor?: string }>
}) => {
  if (core.IS_PROD) {
    return notFound()
  }

  const params = await searchParams
  const isMoR = params.mor !== 'false'

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Demo Page</h1>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">
          MoR Email Preview (Order Receipt)
        </h2>
        <div className="mb-4 flex gap-2 flex-wrap">
          <a
            href="/demo-route?mor=true"
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            Order Receipt (MoR)
          </a>
          <a
            href="/demo-route?mor=false"
            className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
          >
            Order Receipt
          </a>
        </div>
        <MoREmailPreview isMoR={isMoR} />
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
