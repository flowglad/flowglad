'use client'
import { Check, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import DateRangeRevenueChart from '@/components/DateRangeRevenueChart'
import { ExpandSection } from '@/components/ExpandSection'
import ArchiveProductModal from '@/components/forms/ArchiveProductModal'
import CreatePriceModal from '@/components/forms/CreatePriceModal'
import EditProductModal from '@/components/forms/EditProductModal'
import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import { ItemFeature } from '@/components/ItemFeature'
import { CopyableField } from '@/components/ui/copyable-field'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { useAuthenticatedContext } from '@/contexts/authContext'
import type { Feature } from '@/db/schema/features'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'
import { PricesDataTable } from './prices/data-table'

export type InternalProductDetailsPageProps = {
  product: Product.ClientRecord
  prices: Price.ClientRecord[]
  pricingModel: PricingModel.Record
  features: Feature.Record[]
}

/**
 * Formats the description for a feature item based on its type and renewal frequency.
 */
function formatFeatureDescription(
  feature: Feature.Record
): string | undefined {
  if (
    feature.type !== FeatureType.UsageCreditGrant ||
    feature.amount == null
  ) {
    return undefined
  }

  if (
    feature.renewalFrequency ===
    FeatureUsageGrantFrequency.EveryBillingPeriod
  ) {
    return `${feature.amount.toLocaleString()} total credits, every billing period`
  } else {
    return `${feature.amount.toLocaleString()} total credits, one-time`
  }
}

function InternalProductDetailsPage(
  props: InternalProductDetailsPageProps
) {
  const { product, prices, pricingModel, features } = props
  const { organization } = useAuthenticatedContext()
  const router = useRouter()
  const [isCreatePriceOpen, setIsCreatePriceOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isArchiveOpen, setIsArchiveOpen] = useState(false)

  const productURL = `${
    window ? window.location.origin : 'https://app.flowglad.com'
  }/product/${product.id}/purchase`

  const previewProductHandler = () => {
    window.open(productURL, '_blank')
  }

  const handleBreadcrumbClick = () => {
    router.push(`/pricing-models/${pricingModel.id}`)
  }

  // Build badges array
  const badges = [
    product.active
      ? {
          icon: (
            <Check
              className="w-full h-full stroke-current"
              strokeWidth={3}
            />
          ),
          label: 'Active',
          variant: 'active' as const,
        }
      : {
          icon: (
            <X
              className="w-full h-full stroke-current"
              strokeWidth={3}
            />
          ),
          label: 'Inactive',
          variant: 'muted' as const,
        },
    ...(product.default
      ? [
          {
            label: 'Default Product',
            variant: 'muted' as const,
            tooltip:
              'Default products are automatically assigned to customers.',
          },
        ]
      : []),
  ]

  // Build actions array
  const actions = [
    {
      label: 'Edit',
      onClick: () => setIsEditOpen(true),
      variant: 'secondary' as const,
    },
    {
      label: product.active ? 'Archive' : 'Reactivate',
      onClick: () => setIsArchiveOpen(true),
      disabled: product.default,
      disabledTooltip: product.default
        ? 'Cannot archive default products.'
        : undefined,
      variant: 'secondary' as const,
    },
    {
      label: 'Preview',
      onClick: () => previewProductHandler(),
      disabled: product.default,
      disabledTooltip: product.default
        ? 'Cannot preview checkout for default products.'
        : undefined,
      variant: 'secondary' as const,
    },
  ]

  return (
    <InnerPageContainerNew>
      <div className="w-full relative flex flex-col justify-center pb-6">
        <PageHeaderNew
          title={product.name}
          breadcrumb={pricingModel.name}
          onBreadcrumbClick={handleBreadcrumbClick}
          className="pb-4"
          badges={badges}
          description={
            <div className="flex items-center gap-2">
              <CopyableField
                value={product.id}
                label="ID"
                displayText="Copy ID"
              />
              {product.slug && (
                <>
                  <div className="h-[22px] w-px bg-muted-foreground opacity-10" />
                  <CopyableField
                    value={product.slug}
                    label="Slug"
                    displayText="Copy Slug"
                  />
                </>
              )}
            </div>
          }
          actions={actions}
        />
        <ExpandSection title="Revenue" defaultExpanded>
          <DateRangeRevenueChart
            organizationCreatedAt={
              organization?.createdAt
                ? new Date(organization.createdAt)
                : new Date()
            }
            alignDatePicker="left"
            productId={product.id}
          />
        </ExpandSection>
        <ExpandSection title="Features" defaultExpanded={false}>
          <div className="flex flex-col gap-1 w-full">
            {features.length > 0 ? (
              features.map((feature) => (
                <ItemFeature
                  key={feature.id}
                  href={`/features/${feature.id}`}
                  description={formatFeatureDescription(feature)}
                >
                  {feature.name}
                </ItemFeature>
              ))
            ) : (
              <p className="text-sm text-muted-foreground px-3 py-1">
                No features assigned to this product.
              </p>
            )}
          </div>
        </ExpandSection>
        <ExpandSection
          title="Price History"
          defaultExpanded={false}
          contentPadding={false}
        >
          <PricesDataTable
            productId={product.id}
            filters={{
              productId: product.id,
            }}
            onCreatePrice={
              product.default
                ? undefined
                : () => setIsCreatePriceOpen(true)
            }
            buttonVariant="secondary"
          />
        </ExpandSection>
        <CreatePriceModal
          isOpen={isCreatePriceOpen}
          setIsOpen={setIsCreatePriceOpen}
          productId={product.id}
          previousPrice={prices[prices.length - 1]}
        />
      </div>
      <EditProductModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        product={product}
        prices={prices}
      />
      <ArchiveProductModal
        isOpen={isArchiveOpen}
        setIsOpen={setIsArchiveOpen}
        product={{
          id: product.id,
          name: product.name,
          active: product.active,
        }}
      />
    </InnerPageContainerNew>
  )
}

export default InternalProductDetailsPage
