'use client'

import Button from '@/components/ion/Button'
import { trpc } from '../_trpc/client'

type RichCustomer = {
  subscription: {
    name: string
    price: string
    status: string
    nextBillingDate: string
  }
} | null

const InternalDemoPage = () => {
  let customer: RichCustomer = null
  if (1 > 0) {
    customer = {
      subscription: {
        name: 'Pro',
        price: '100',
        status: 'active',
        nextBillingDate: '2025-01-28',
      },
    }
  }
  const cloneCatalogMutation = trpc.catalogs.clone.useMutation()
  const { data: defaultCatalog } = trpc.catalogs.getDefault.useQuery(
    {}
  )
  return (
    <div style={{ padding: '20px' }}>
      <h1>Internal Demo Page</h1>
      {defaultCatalog && (
        <Button
          onClick={() =>
            cloneCatalogMutation.mutate({
              id: defaultCatalog.id,
              name: `Cloned Catalog - ${new Date().toISOString()}`,
            })
          }
        >
          Clone Catalog
        </Button>
      )}
    </div>
  )
}

export default InternalDemoPage
