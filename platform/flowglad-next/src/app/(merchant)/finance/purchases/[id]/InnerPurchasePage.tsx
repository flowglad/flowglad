'use client'

import { CurrencyCode } from '@db-core/enums'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CustomerCardNew } from '@/components/CustomerCardNew'
import { ExpandSection } from '@/components/ExpandSection'
import PageContainer from '@/components/PageContainer'
import { Badge } from '@/components/ui/badge'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import type { Customer } from '@/db/schema/customers'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { Purchase } from '@/db/schema/purchases'
import core from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

const getPurchaseStatusBadge = (
  purchase: Purchase.ClientRecord
): {
  label: string
  variant: 'active' | 'muted' | 'destructive' | 'warning'
} => {
  if (purchase.endDate) {
    return { label: 'Concluded', variant: 'muted' }
  } else if (purchase.purchaseDate) {
    return { label: 'Paid', variant: 'active' }
  } else {
    return { label: 'Pending', variant: 'muted' }
  }
}

const InnerPurchasePage = ({
  purchase,
  customer,
  price,
  product,
}: {
  purchase: Purchase.ClientRecord
  customer: Customer.Record
  price: Price.Record | null
  product: Product.Record | null
}) => {
  const router = useRouter()

  return (
    <PageContainer>
      <div className="w-full relative flex flex-col justify-center gap-6 pb-6">
        <PageHeaderNew
          title="Purchase Details"
          breadcrumb="Purchases"
          onBreadcrumbClick={() => router.push('/finance/purchases')}
          badges={[getPurchaseStatusBadge(purchase)]}
          description={
            purchase.purchaseDate
              ? `Purchased ${core.formatDate(purchase.purchaseDate)}`
              : 'Pending purchase'
          }
        />
        <ExpandSection title="Customer" defaultExpanded={true}>
          <CustomerCardNew
            name={customer.name || customer.email}
            email={customer.email}
            href={`/customers/${customer.id}`}
          />
        </ExpandSection>
        {product && (
          <ExpandSection title="Product" defaultExpanded={true}>
            <div className="flex flex-col gap-2">
              <div>
                <Link
                  href={`/products/${product.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {product.name}
                </Link>
              </div>
              {product.description && (
                <div className="text-sm text-muted-foreground">
                  {product.description}
                </div>
              )}
            </div>
          </ExpandSection>
        )}
        {price && (
          <ExpandSection title="Price" defaultExpanded={true}>
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">
                {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                  (price.currency as CurrencyCode) ||
                    CurrencyCode.USD,
                  price.unitPrice
                )}
              </div>
              {price.type && (
                <div className="text-sm text-muted-foreground">
                  Type: {price.type}
                </div>
              )}
            </div>
          </ExpandSection>
        )}
        <ExpandSection
          title="Purchase Information"
          defaultExpanded={true}
        >
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-sm font-medium">Purchase ID</div>
              <div className="text-sm text-muted-foreground">
                {purchase.id}
              </div>
            </div>
            {purchase.name && (
              <div>
                <div className="text-sm font-medium">Name</div>
                <div className="text-sm text-muted-foreground">
                  {purchase.name}
                </div>
              </div>
            )}
            {purchase.purchaseDate && (
              <div>
                <div className="text-sm font-medium">
                  Purchase Date
                </div>
                <div className="text-sm text-muted-foreground">
                  {core.formatDate(purchase.purchaseDate)}
                </div>
              </div>
            )}
            {purchase.endDate && (
              <div>
                <div className="text-sm font-medium">End Date</div>
                <div className="text-sm text-muted-foreground">
                  {core.formatDate(purchase.endDate)}
                </div>
              </div>
            )}
          </div>
        </ExpandSection>
      </div>
    </PageContainer>
  )
}

export default InnerPurchasePage
